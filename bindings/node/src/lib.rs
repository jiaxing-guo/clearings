use clearings_core::{Engine, Failure, MAX_SAFE_INTEGER, decode};
use napi::{Error, Result};
use napi_derive::napi;
fn err(error: Failure) -> Error {
    Error::from_reason(error.to_string())
}
fn time(now: f64) -> Result<u64> {
    if !now.is_finite() || now < 0.0 || now.fract() != 0.0 || now > MAX_SAFE_INTEGER as f64 {
        return Err(err(Failure::new(clearings_core::ErrorCode::InvalidValue)));
    }
    Ok(now as u64)
}
#[napi]
pub struct NativeEngine {
    inner: Engine,
}
#[napi]
impl NativeEngine {
    #[napi(constructor)]
    pub fn new(limits: String) -> Result<Self> {
        Ok(Self {
            inner: Engine::new(decode(&limits).map_err(err)?).map_err(err)?,
        })
    }
    #[napi]
    pub fn submit(&mut self, plan: String, now: f64) -> Result<u32> {
        self.inner
            .submit(decode(&plan).map_err(err)?, time(now)?)
            .map_err(err)
    }
    #[napi]
    pub fn advance(&mut self, events: String, now: f64, budget: u32) -> Result<String> {
        let turn = self
            .inner
            .advance(decode(&events).map_err(err)?, time(now)?, budget)
            .map_err(err)?;
        serde_json::to_string(&turn).map_err(|e| Error::from_reason(e.to_string()))
    }
    #[napi]
    pub fn close(&mut self) {
        self.inner.close();
    }
    #[napi]
    pub fn snapshot(&self) -> Result<String> {
        serde_json::to_string(&self.inner.snapshot()).map_err(|e| Error::from_reason(e.to_string()))
    }
}
