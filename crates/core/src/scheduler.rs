use crate::*;
use std::collections::{BTreeMap, BTreeSet, VecDeque};

#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Waiting,
    Running(u32),
    Done,
}
struct Slot {
    state: State,
    value: Option<u32>,
    consumers: usize,
    missing: usize,
    dependents: Vec<usize>,
    ready_at: u64,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Phase {
    Validate,
    Activate,
    Active,
}
struct Run {
    plan: Plan,
    slots: Vec<Slot>,
    phase: Phase,
    cursor: usize,
    ready: VecDeque<usize>,
    notify: VecDeque<(usize, usize)>,
    seen_values: BTreeSet<u32>,
    terminal: bool,
    error: Option<Failure>,
    finished_sent: bool,
    cleanup: usize,
    in_flight: u32,
    deadline: u64,
    record: Record,
}
impl Run {
    fn stop(&mut self, error: Option<Failure>, now: u64) {
        if self.terminal {
            return;
        }
        self.terminal = true;
        self.error = error;
        self.record.finished_ms = now;
        self.record.uncertain_actions = self.in_flight;
    }
    fn available(&self, capacity: bool) -> bool {
        if self.terminal {
            return !self.finished_sent || self.cleanup < self.slots.len() || self.in_flight == 0;
        }
        self.phase != Phase::Active
            || !self.notify.is_empty()
            || self.ready.front().is_some_and(|&i| {
                self.plan.nodes[i].kind == Kind::Value
                    || (capacity && self.in_flight < self.plan.max_in_flight)
            })
    }
}

/// All external state is supplied by the host. One instance is reusable across runs.
pub struct Engine {
    limits: Limits,
    runs: BTreeMap<u32, Run>,
    order: VecDeque<u32>,
    actions: BTreeMap<u32, (u32, usize)>,
    nodes: u32,
    next_run: u32,
    next_command: u32,
    now: u64,
    closed: bool,
    ignored: u64,
}
impl Engine {
    pub fn new(limits: Limits) -> Result<Self, Failure> {
        if limits.max_runs == 0
            || limits.max_runs > 1024
            || limits.max_nodes == 0
            || limits.max_nodes > 65_536
            || limits.max_in_flight == 0
            || limits.max_in_flight > 4096
        {
            return Err(Failure::new(ErrorCode::Capacity));
        }
        Ok(Self {
            limits,
            runs: BTreeMap::new(),
            order: VecDeque::new(),
            actions: BTreeMap::new(),
            nodes: 0,
            next_run: 1,
            next_command: 1,
            now: 0,
            closed: false,
            ignored: 0,
        })
    }
    fn time(&mut self, now: u64) -> Result<(), Failure> {
        if now < self.now || now > MAX_SAFE_INTEGER {
            return Err(Failure::new(ErrorCode::InvalidValue));
        }
        self.now = now;
        Ok(())
    }
    pub fn submit(&mut self, plan: Plan, now: u64) -> Result<u32, Failure> {
        self.time(now)?;
        if self.closed {
            return Err(Failure::new(ErrorCode::Closed));
        }
        if plan.protocol != PROTOCOL_VERSION {
            return Err(Failure::new(ErrorCode::Unsupported));
        }
        if plan.nodes.is_empty()
            || plan.root as usize >= plan.nodes.len()
            || plan.flow.is_empty()
            || plan.flow.len() > 256
            || plan.build.len() > 256
            || plan.timeout_ms == 0
            || plan.max_in_flight == 0
            || plan.max_in_flight > self.limits.max_in_flight
        {
            return Err(Failure::new(ErrorCode::InvalidPlan));
        }
        if self.runs.len() >= self.limits.max_runs as usize
            || plan.nodes.len() > (self.limits.max_nodes - self.nodes) as usize
        {
            return Err(Failure::new(ErrorCode::Capacity));
        }
        let deadline = now
            .checked_add(u64::from(plan.timeout_ms))
            .filter(|d| *d <= MAX_SAFE_INTEGER)
            .ok_or_else(|| Failure::new(ErrorCode::InvalidValue))?;
        let id = self.next_run;
        self.next_run = id
            .checked_add(1)
            .ok_or_else(|| Failure::new(ErrorCode::Capacity))?;
        let slots = plan
            .nodes
            .iter()
            .map(|n| Slot {
                state: State::Waiting,
                value: n.value,
                consumers: 0,
                missing: n.deps.len(),
                dependents: Vec::new(),
                ready_at: now,
            })
            .collect();
        let record = Record {
            protocol: PROTOCOL_VERSION,
            core_version: CORE_VERSION.into(),
            strategy: STRATEGY.into(),
            flow: plan.flow.clone(),
            build: plan.build.clone(),
            started_ms: now,
            finished_ms: now,
            logical_calls: plan.nodes.iter().filter(|n| n.kind == Kind::Call).count() as u32,
            dispatched_calls: 0,
            completed_calls: 0,
            queue_ms: 0,
            uncertain_actions: 0,
            effective_max_in_flight: plan.max_in_flight,
            limit_origin: if plan.max_in_flight < self.limits.max_in_flight {
                "run"
            } else {
                "runtime"
            }
            .into(),
        };
        self.nodes += plan.nodes.len() as u32;
        self.runs.insert(
            id,
            Run {
                plan,
                slots,
                phase: Phase::Validate,
                cursor: 0,
                ready: VecDeque::new(),
                notify: VecDeque::new(),
                seen_values: BTreeSet::new(),
                terminal: false,
                error: None,
                finished_sent: false,
                cleanup: 0,
                in_flight: 0,
                deadline,
                record,
            },
        );
        self.order.push_back(id);
        Ok(id)
    }
    pub fn close(&mut self) {
        self.closed = true;
        for run in self.runs.values_mut() {
            run.stop(Some(Failure::new(ErrorCode::Cancelled)), self.now);
        }
    }
    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            runs: self.runs.len() as u32,
            nodes: self.nodes,
            in_flight: self.actions.len() as u32,
            ignored_completions: self.ignored,
            closed: self.closed,
        }
    }
    pub fn advance(&mut self, events: Vec<Event>, now: u64, budget: u32) -> Result<Turn, Failure> {
        if budget == 0
            || budget > 4096
            || events.len() > MAX_EVENTS
            || events.len() > budget as usize
        {
            return Err(Failure::new(ErrorCode::Capacity));
        }
        self.time(now)?;
        let mut commands = Vec::new();
        let mut steps = events.len() as u32;
        // Cancellation wins over completions and dispatch within the same turn.
        for event in &events {
            if let Event::Cancel { run } = event {
                if let Some(r) = self.runs.get_mut(run) {
                    r.stop(Some(Failure::new(ErrorCode::Cancelled)), now);
                }
            }
        }
        for event in events {
            self.event(event, &mut commands);
        }
        let mut idle = 0;
        while steps < budget && !self.order.is_empty() && idle < self.order.len() {
            let id = self.order.pop_front().expect("nonempty order");
            let mut run = self.runs.remove(&id).expect("registered run");
            if !run.terminal && now >= run.deadline {
                run.stop(Some(Failure::new(ErrorCode::Timeout)), now);
            }
            steps += 1;
            if run.terminal
                && run.finished_sent
                && run.cleanup == run.slots.len()
                && run.in_flight == 0
            {
                self.nodes -= run.slots.len() as u32;
                commands.push(Command::Dropped { run: id });
                idle = 0;
                continue;
            }
            let progress = self.step(id, &mut run, &mut commands);
            idle = if progress { 0 } else { idle + 1 };
            self.runs.insert(id, run);
            self.order.push_back(id);
        }
        let capacity = self.actions.len() < self.limits.max_in_flight as usize;
        let has_work = self
            .runs
            .values()
            .any(|r| r.available(capacity) || (!r.terminal && now >= r.deadline));
        let next_wakeup_ms = self
            .runs
            .values()
            .filter(|r| !r.terminal)
            .map(|r| r.deadline)
            .min();
        Ok(Turn {
            commands,
            has_work,
            next_wakeup_ms,
            steps,
        })
    }
    fn event(&mut self, event: Event, commands: &mut Vec<Command>) {
        let Event::Complete {
            run: id,
            command,
            value,
            error,
        } = event
        else {
            return;
        };
        let Some(&(owner, node)) = self.actions.get(&command) else {
            self.ignored += 1;
            return;
        };
        if owner != id {
            self.ignored += 1;
            return;
        }
        self.actions.remove(&command);
        let run = self.runs.get_mut(&id).expect("live action retains run");
        run.in_flight -= 1;
        run.slots[node].state = State::Done;
        if !run.terminal && self.now >= run.deadline {
            run.stop(Some(Failure::new(ErrorCode::Timeout)), self.now);
        }
        let valid_value = value.is_some_and(|v| v > 0 && !run.seen_values.contains(&v));
        if run.terminal {
            if valid_value {
                commands.push(Command::Release {
                    run: id,
                    value: value.unwrap(),
                });
            }
            return;
        }
        if let Some(mut failure) = error {
            failure.source = Some(run.plan.nodes[node].source.clone());
            if valid_value {
                commands.push(Command::Release {
                    run: id,
                    value: value.unwrap(),
                });
            }
            run.stop(Some(failure), self.now);
        } else if valid_value {
            let value = value.unwrap();
            run.seen_values.insert(value);
            run.slots[node].value = Some(value);
            if run.plan.nodes[node].kind == Kind::Call {
                run.record.completed_calls += 1;
            }
            if node == run.plan.root as usize {
                run.stop(None, self.now);
            } else {
                run.notify.push_back((node, 0));
            }
        } else {
            run.stop(Some(Failure::new(ErrorCode::InvalidValue)), self.now);
        }
    }
    fn step(&mut self, id: u32, run: &mut Run, commands: &mut Vec<Command>) -> bool {
        if run.terminal {
            if !run.finished_sent {
                commands.push(Command::Finished {
                    run: id,
                    value: if run.error.is_none() {
                        run.slots[run.plan.root as usize].value
                    } else {
                        None
                    },
                    error: run.error.clone(),
                    record: run.record.clone(),
                });
                run.finished_sent = true;
                return true;
            }
            if run.cleanup < run.slots.len() {
                let slot = &mut run.slots[run.cleanup];
                if let State::Running(command) = slot.state {
                    commands.push(Command::Cancel { run: id, command });
                }
                if let Some(value) = slot.value.take() {
                    commands.push(Command::Release { run: id, value });
                }
                run.cleanup += 1;
                return true;
            }
            return false;
        }
        match run.phase {
            Phase::Validate => {
                let i = run.cursor;
                let node = &run.plan.nodes[i];
                let valid = node.deps.len() <= MAX_DEPENDENCIES
                    && node.deps.iter().all(|d| (*d as usize) < i)
                    && node.binding.len() <= 256
                    && node.source.len() <= 1024
                    && !node.source.is_empty()
                    && match node.kind {
                        Kind::Value => {
                            node.deps.is_empty()
                                && node
                                    .value
                                    .is_some_and(|v| v > 0 && run.seen_values.insert(v))
                        }
                        Kind::Call | Kind::Transform => {
                            node.value.is_none() && node.deps.len() == 1 && !node.binding.is_empty()
                        }
                        Kind::Join => node.value.is_none() && !node.binding.is_empty(),
                    };
                if !valid {
                    run.stop(
                        Some(Failure {
                            code: ErrorCode::InvalidPlan,
                            source: Some(format!("node:{i}")),
                        }),
                        self.now,
                    );
                    return true;
                }
                for &dep in &node.deps {
                    run.slots[dep as usize].consumers += 1;
                    run.slots[dep as usize].dependents.push(i);
                }
                run.cursor += 1;
                if run.cursor == run.slots.len() {
                    run.phase = Phase::Activate;
                    run.cursor = 0;
                }
                true
            }
            Phase::Activate => {
                let i = run.cursor;
                if i != run.plan.root as usize && run.slots[i].consumers == 0 {
                    run.stop(
                        Some(Failure {
                            code: ErrorCode::InvalidPlan,
                            source: Some(format!("node:{i}")),
                        }),
                        self.now,
                    );
                    return true;
                }
                if run.slots[i].missing == 0 {
                    run.slots[i].ready_at = self.now;
                    run.ready.push_back(i);
                }
                run.cursor += 1;
                if run.cursor == run.slots.len() {
                    run.phase = Phase::Active;
                }
                true
            }
            Phase::Active => {
                if let Some((node, cursor)) = run.notify.pop_front() {
                    if let Some(&child) = run.slots[node].dependents.get(cursor) {
                        run.slots[child].missing -= 1;
                        if run.slots[child].missing == 0 {
                            run.slots[child].ready_at = self.now;
                            run.ready.push_back(child);
                        }
                        if cursor + 1 < run.slots[node].dependents.len() {
                            run.notify.push_front((node, cursor + 1));
                        }
                    }
                    return true;
                }
                let Some(&i) = run.ready.front() else {
                    return false;
                };
                let node = &run.plan.nodes[i];
                if node.kind == Kind::Value {
                    run.ready.pop_front();
                    run.slots[i].state = State::Done;
                    if i == run.plan.root as usize {
                        run.stop(None, self.now);
                    } else {
                        run.notify.push_back((i, 0));
                    }
                    return true;
                }
                if self.actions.len() >= self.limits.max_in_flight as usize
                    || run.in_flight >= run.plan.max_in_flight
                {
                    return false;
                }
                let command = self.next_command;
                let Some(next) = command.checked_add(1) else {
                    run.stop(Some(Failure::new(ErrorCode::Capacity)), self.now);
                    return true;
                };
                self.next_command = next;
                let inputs = node
                    .deps
                    .iter()
                    .map(|&d| run.slots[d as usize].value.expect("live dependency"))
                    .collect();
                commands.push(Command::Dispatch {
                    run: id,
                    command,
                    node: i as u32,
                    kind: node.kind,
                    binding: node.binding.clone(),
                    source: node.source.clone(),
                    inputs,
                });
                for &dep in &node.deps {
                    let slot = &mut run.slots[dep as usize];
                    slot.consumers -= 1;
                    if slot.consumers == 0 {
                        if let Some(value) = slot.value.take() {
                            commands.push(Command::Release { run: id, value });
                        }
                    }
                }
                run.ready.pop_front();
                run.slots[i].state = State::Running(command);
                run.in_flight += 1;
                self.actions.insert(command, (id, i));
                if node.kind == Kind::Call {
                    run.record.dispatched_calls += 1;
                    run.record.queue_ms += self.now - run.slots[i].ready_at;
                }
                true
            }
        }
    }
}
