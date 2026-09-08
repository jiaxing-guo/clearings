use crate::{OwnedValue, Value};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Resource {
    Work,
    AllocationUnits,
    ValueUnits,
    EvaluationDepth,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Usage {
    pub work: u64,
    pub allocation_units: u64,
    pub value_units: u64,
    pub evaluation_depth: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    pub work: u64,
    pub allocation_units: u64,
    pub value_units: u64,
    pub evaluation_depth: u64,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            work: 1_000_000,
            allocation_units: 1_000_000,
            value_units: 100_000,
            evaluation_depth: 128,
        }
    }
}
impl Limits {
    pub const MAX: Self = Self {
        work: 10_000_000,
        allocation_units: 10_000_000,
        value_units: 1_000_000,
        evaluation_depth: 256,
    };
    pub fn validate(self) -> Result<Self, &'static str> {
        for (actual, maximum) in [
            (self.work, Self::MAX.work),
            (self.allocation_units, Self::MAX.allocation_units),
            (self.value_units, Self::MAX.value_units),
            (self.evaluation_depth, Self::MAX.evaluation_depth),
        ] {
            if actual == 0 || actual > maximum {
                return Err("Execution limit is outside its supported range.");
            }
        }
        Ok(self)
    }
    fn get(self, resource: Resource) -> u64 {
        match resource {
            Resource::Work => self.work,
            Resource::AllocationUnits => self.allocation_units,
            Resource::ValueUnits => self.value_units,
            Resource::EvaluationDepth => self.evaluation_depth,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Arguments,
    Execution,
    Result,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CallFrame {
    pub function_id: String,
    pub call_path: String,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Diagnostic {
    pub phase: Phase,
    pub path: String,
    pub call_stack: Vec<CallFrame>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FaultCode {
    IntegerOverflow,
    IndexOutOfBounds,
}

/// InvalidAbi is a compiler/runtime defect, never an application or language completion.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuntimeError {
    ApplicationFailure {
        code: String,
        details: Value,
        diagnostic: Diagnostic,
    },
    RuntimeFault {
        code: FaultCode,
        message: String,
        diagnostic: Diagnostic,
    },
    ResourceExhaustion {
        resource: Resource,
        limit: u64,
        diagnostic: Diagnostic,
    },
    InvalidAbi(&'static str),
}
pub type Eval<T> = Result<T, RuntimeError>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Completion {
    Return {
        value: OwnedValue,
    },
    ApplicationFailure {
        code: String,
        details: OwnedValue,
        diagnostic: Diagnostic,
    },
    RuntimeFault {
        code: FaultCode,
        message: String,
        diagnostic: Diagnostic,
    },
    ResourceExhaustion {
        resource: Resource,
        limit: u64,
        diagnostic: Diagnostic,
    },
}

/// Logical charges reproduce reference semantics; they do not measure physical heap bytes.
pub struct Runtime {
    limits: Limits,
    usage: Usage,
    depth: u64,
    phase: Phase,
    path: String,
    calls: Vec<CallFrame>,
}
impl Runtime {
    pub fn new(limits: Limits) -> Result<Self, &'static str> {
        Ok(Self {
            limits: limits.validate()?,
            usage: Usage::default(),
            depth: 0,
            phase: Phase::Arguments,
            path: "/arguments".into(),
            calls: vec![],
        })
    }
    pub fn limits(&self) -> Limits {
        self.limits
    }
    pub fn usage(&self) -> Usage {
        self.usage
    }
    pub fn set_phase(&mut self, phase: Phase) {
        self.phase = phase;
    }
    pub fn diagnostic(&self) -> Diagnostic {
        Diagnostic {
            phase: self.phase,
            path: self.path.clone(),
            call_stack: self.calls.clone(),
        }
    }
    fn check(&self, resource: Resource, next: Option<u64>) -> Eval<()> {
        let limit = self.limits.get(resource);
        if next.is_none_or(|n| n > limit) {
            return Err(RuntimeError::ResourceExhaustion {
                resource,
                limit,
                diagnostic: self.diagnostic(),
            });
        }
        Ok(())
    }
    pub fn work(&mut self, units: u64) -> Eval<()> {
        self.check(Resource::Work, self.usage.work.checked_add(units))?;
        self.usage.work += units;
        Ok(())
    }
    pub fn allocate(&mut self, units: u64) -> Eval<()> {
        self.check(
            Resource::AllocationUnits,
            self.usage.allocation_units.checked_add(units),
        )?;
        self.usage.allocation_units += units;
        Ok(())
    }
    pub(crate) fn materialize(&mut self, units: u64) -> Eval<()> {
        self.check(Resource::ValueUnits, Some(units))?;
        self.allocate(units)?;
        self.usage.value_units = self.usage.value_units.max(units);
        Ok(())
    }
    pub fn at<T>(&mut self, path: &str, action: impl FnOnce(&mut Self) -> Eval<T>) -> Eval<T> {
        let previous = std::mem::replace(&mut self.path, path.to_owned());
        let result = action(self);
        self.path = previous;
        result
    }
    pub fn enter<T>(&mut self, path: &str, action: impl FnOnce(&mut Self) -> Eval<T>) -> Eval<T> {
        self.at(path, |runtime| {
            runtime.work(1)?;
            runtime.check(Resource::EvaluationDepth, runtime.depth.checked_add(1))?;
            runtime.depth += 1;
            runtime.usage.evaluation_depth = runtime.usage.evaluation_depth.max(runtime.depth);
            let result = action(runtime);
            runtime.depth -= 1;
            result
        })
    }
    pub fn call<T>(
        &mut self,
        id: &str,
        call_path: &str,
        function_path: &str,
        action: impl FnOnce(&mut Self) -> Eval<T>,
    ) -> Eval<T> {
        self.calls.push(CallFrame {
            function_id: id.into(),
            call_path: call_path.into(),
        });
        let result = self.enter(function_path, |runtime| {
            runtime.work(id.encode_utf16().count() as u64)?;
            action(runtime)
        });
        self.calls.pop();
        result
    }
    /// The emitter knows lexical distance, but must charge every reference scope.
    pub fn lookup(&mut self, name: &str, scopes: usize) -> Eval<()> {
        if scopes == 0 {
            return Err(RuntimeError::InvalidAbi("A lookup must examine a scope."));
        }
        self.work(name.encode_utf16().count() as u64)?;
        for _ in 0..scopes {
            self.work(1)?;
        }
        Ok(())
    }
    pub fn bind(&mut self, name: &str) -> Eval<()> {
        self.work(1 + name.encode_utf16().count() as u64)
    }
    pub(crate) fn fault(&self, code: FaultCode, message: String) -> RuntimeError {
        RuntimeError::RuntimeFault {
            code,
            message,
            diagnostic: self.diagnostic(),
        }
    }
    pub fn fail<T>(&self, code: &str, details: Value) -> Eval<T> {
        Err(RuntimeError::ApplicationFailure {
            code: code.into(),
            details,
            diagnostic: self.diagnostic(),
        })
    }
    /// Invoke only after generated calls have unwound. Export failure can replace a return/fail.
    pub fn finish(&mut self, result: Eval<Value>) -> Eval<Completion> {
        if !self.calls.is_empty() || self.depth != 0 {
            return Err(RuntimeError::InvalidAbi(
                "Finish requires unwound calls and evaluations.",
            ));
        }
        let outcome = match result {
            Ok(value) => {
                self.phase = Phase::Result;
                self.at("/result/value", |r| r.export(&value))
                    .map(|value| Completion::Return { value })
            }
            Err(RuntimeError::ApplicationFailure {
                code,
                details,
                diagnostic,
            }) => {
                self.phase = Phase::Result;
                self.at("/result/details", |r| r.export(&details))
                    .map(|details| Completion::ApplicationFailure {
                        code,
                        details,
                        diagnostic,
                    })
            }
            Err(error) => Err(error),
        };
        match outcome {
            Ok(completion) => Ok(completion),
            Err(RuntimeError::RuntimeFault {
                code,
                message,
                diagnostic,
            }) => Ok(Completion::RuntimeFault {
                code,
                message,
                diagnostic,
            }),
            Err(RuntimeError::ResourceExhaustion {
                resource,
                limit,
                diagnostic,
            }) => Ok(Completion::ResourceExhaustion {
                resource,
                limit,
                diagnostic,
            }),
            Err(error) => Err(error),
        }
    }
}
