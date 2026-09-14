//! Replace a component only after paired measurements under the same frozen task.
use crate::{
    capabilities::LocalBroker,
    store::{ENGINE, Store, Task, Version},
};
use anyhow::{Context, Result, ensure};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};
use std::path::Path;
fn metrics(report: &Value) -> Result<(u64, u64)> {
    ensure!(
        report["accepted"] == true,
        "a measured run failed acceptance"
    );
    let mut calls = 0;
    let mut elapsed = 0;
    for case in report["cases"].as_array().context("missing cases")? {
        calls += case["run"]["capability_calls"]
            .as_u64()
            .context("missing calls")?;
        elapsed += case["run"]["elapsed_ms"]
            .as_u64()
            .context("missing duration")?;
    }
    Ok((calls, elapsed))
}
fn benefit(baseline: &[(u64, u64)], candidate: &[(u64, u64)]) -> bool {
    if baseline.len() != 3 || candidate.len() != 3 {
        return false;
    }
    let b = baseline.iter().map(|m| m.0).max().unwrap();
    let c = candidate.iter().map(|m| m.0).max().unwrap();
    // Call reductions are deterministic evidence. Timing-only changes need separation across all pairs.
    let mut bt: Vec<_> = baseline.iter().map(|v| v.1).collect();
    bt.sort();
    let mut ct: Vec<_> = candidate.iter().map(|v| v.1).collect();
    ct.sort();
    (c < b && ct[1] <= bt[1] * 125 / 100 + 2)
        || (c == b
            && baseline
                .iter()
                .zip(candidate)
                .all(|(b, c)| c.1 + 2 < b.1 && c.1 * 100 <= b.1 * 80))
}
impl Store {
    pub(crate) fn improve(&mut self, project: &str, job: i64, executable: &Path) -> Result<Value> {
        let p = self.project(project)?;
        if !p.settings.improve {
            return Ok(json!({"status":"disabled"}));
        }
        self.check_job(project, job)?;
        let found:Option<(String,String)>=self.db.query_row("SELECT project_routines.task,active.version FROM project_routines JOIN active ON active.task=project_routines.task LEFT JOIN improvement_trials ON improvement_trials.project=project_routines.project AND improvement_trials.baseline=active.version WHERE project_routines.project=?1 AND paused=0 AND excluded=0 AND improvement_trials.baseline IS NULL ORDER BY name LIMIT 1",[project],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        let Some((task_id, baseline)) = found else {
            return Ok(json!({"status":"no_candidate"}));
        };
        let task: Task = self.get("task", &task_id)?;
        if p.settings.excludes(&task.contract.name) {
            return Ok(json!({"status":"excluded"}));
        }
        let version: Version = self.get("version", &baseline)?;
        ensure!(
            version.engine == ENGINE,
            "component runtime dependency changed"
        );
        LocalBroker::new(&task.contract, &p.settings.grants)
            .context("component capability dependency is unavailable")?;
        self.db.execute(
            "INSERT INTO improvement_trials(project,baseline,status) VALUES(?1,?2,'measuring')",
            params![project, baseline],
        )?;
        let result = (|| -> Result<Value> {
            ensure!(
                task.cases.len() >= 3 && task.cases.len() <= 8,
                "improvement requires 3 to 8 recorded cases"
            );
            let source=self.propose_source(project,job,"improve",json!({"contract":task.contract,"source":version.source,"examples":&task.cases[..task.cases.len()-1],"purpose":"Reduce redundant reads or execution time while preserving behavior. One recorded example is withheld."}))?;
            self.check_job(project, job)?;
            let candidate = self.submit(executable, &task_id, source)?;
            ensure!(
                candidate != baseline,
                "model returned the existing component"
            );
            self.db.execute(
                "UPDATE improvement_trials SET candidate=?3 WHERE project=?1 AND baseline=?2",
                params![project, baseline, candidate],
            )?;
            ensure!(
                self.evaluate(executable, &candidate)?["accepted"] == true,
                "candidate fails frozen acceptance"
            );
            let mut before = vec![];
            let mut after = vec![];
            for i in 0..3 {
                let guard = || self.check_job(project, job);
                let (b, c) = if i % 2 == 0 {
                    let b = self.evaluate_fresh(executable, &baseline, guard)?;
                    let c = self.evaluate_fresh(executable, &candidate, guard)?;
                    (b, c)
                } else {
                    let c = self.evaluate_fresh(executable, &candidate, guard)?;
                    let b = self.evaluate_fresh(executable, &baseline, guard)?;
                    (b, c)
                };
                before.push(metrics(&b)?);
                after.push(metrics(&c)?);
            }
            let accepted = benefit(&before, &after);
            let measurements = json!({"baseline":baseline,"candidate":candidate,"baseline_samples":before,"candidate_samples":after,"sample_fields":["capability_calls","elapsed_ms"],"accepted":accepted,"model_savings":null});
            if accepted {
                self.promote_automatic(&p, job, &candidate, Some(&baseline), "improved")?;
            }
            Ok(measurements)
        })();
        let (status, report) = match result {
            Ok(v) => (
                if v["accepted"] == true {
                    "improved"
                } else {
                    "no_benefit"
                },
                v,
            ),
            Err(e) => ("failed", json!({"error":e.to_string()})),
        };
        self.db.execute(
            "UPDATE improvement_trials SET status=?3,report=?4 WHERE project=?1 AND baseline=?2",
            params![project, baseline, status, report.to_string()],
        )?;
        Ok(json!({"status":status,"report":report}))
    }
    pub(crate) fn recover_regression(&self, task: &str, failed: &str) -> Result<Option<Value>> {
        let previous:Option<(String,String)>=self.db.query_row("SELECT project,previous FROM project_routines WHERE task=?1 AND previous IS NOT NULL AND EXISTS(SELECT 1 FROM component_changes WHERE task=?1 AND version=?2 AND reason='improved')",params![task,failed],|r|Ok((r.get(0)?,r.get(1)?))).optional()?;
        let Some((project, previous)) = previous else {
            return Ok(None);
        };
        let version: Version = self.get("version", &previous)?;
        ensure!(
            version.task == task && version.engine == ENGINE,
            "rollback dependency is unavailable"
        );
        let tx = self.db.unchecked_transaction()?;
        if tx.execute(
            "UPDATE active SET version=?3 WHERE task=?1 AND version=?2",
            params![task, failed, previous],
        )? == 0
        {
            return Ok(None);
        }
        tx.execute(
            "UPDATE project_routines SET previous=NULL WHERE project=?1 AND task=?2",
            params![project, task],
        )?;
        tx.execute("INSERT INTO component_changes(project,task,version,previous,reason) VALUES(?1,?2,?3,?4,'regression_recovery')",params![project,task,previous,failed])?;
        tx.commit()?;
        Ok(Some(
            json!({"restored_version":previous,"reason":"Failure after automatic replacement; the previous version is active for later runs. Continue this task with the agent."}),
        ))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replacements_require_measured_call_reduction_or_consistent_time_improvement() {
        assert!(benefit(&[(6, 20); 3], &[(3, 20); 3]));
        assert!(benefit(&[(3, 20); 3], &[(3, 12); 3]));
        assert!(!benefit(&[(3, 20); 3], &[(3, 19); 3]));
        assert!(!benefit(&[(3, 20); 3], &[(4, 1); 3]));
        assert!(!benefit(&[(3, 20); 3], &[(3, 12), (3, 12), (3, 19)]));
    }
}
