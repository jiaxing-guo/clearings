use clearings_core::{Engine, Failure, MAX_SAFE_INTEGER, decode};
use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;
fn err(error: Failure) -> PyErr {
    PyValueError::new_err(error.to_string())
}
fn time(now: f64) -> PyResult<u64> {
    if !now.is_finite() || now < 0.0 || now.fract() != 0.0 || now > MAX_SAFE_INTEGER as f64 {
        return Err(err(Failure::new(clearings_core::ErrorCode::InvalidValue)));
    }
    Ok(now as u64)
}
#[pyclass(module = "clearings._native")]
struct NativeEngine {
    inner: Engine,
}
#[pymethods]
impl NativeEngine {
    #[new]
    fn new(limits: String) -> PyResult<Self> {
        Ok(Self {
            inner: Engine::new(decode(&limits).map_err(err)?).map_err(err)?,
        })
    }
    fn submit(&mut self, plan: String, now: f64) -> PyResult<u32> {
        self.inner
            .submit(decode(&plan).map_err(err)?, time(now)?)
            .map_err(err)
    }
    fn advance(&mut self, events: String, now: f64, budget: u32) -> PyResult<String> {
        let turn = self
            .inner
            .advance(decode(&events).map_err(err)?, time(now)?, budget)
            .map_err(err)?;
        serde_json::to_string(&turn).map_err(|e| PyValueError::new_err(e.to_string()))
    }
    fn close(&mut self) {
        self.inner.close();
    }
    fn snapshot(&self) -> PyResult<String> {
        serde_json::to_string(&self.inner.snapshot())
            .map_err(|e| PyValueError::new_err(e.to_string()))
    }
}
#[pymodule]
fn _native(module: &Bound<'_, PyModule>) -> PyResult<()> {
    module.add_class::<NativeEngine>()
}
