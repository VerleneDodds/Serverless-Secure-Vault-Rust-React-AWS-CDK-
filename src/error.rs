use lambda_http::{Body, Response};
use serde::Serialize;

#[derive(Serialize)]
pub struct ApiErrorResponse {
    pub error: String,
    pub message: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Invalid request body: {0}")]
    InvalidBody(String),
    #[error("Validation failed: {0}")]
    ValidationError(String),
    #[error("Resource not found: {0}")]
    NotFound(String),
    #[error("HTTP response building error: {0}")]
    HttpError(String),
    #[error("Internal server error: {0}")]
    Internal(String),
}

impl From<lambda_http::http::Error> for AppError {
    fn from(err: lambda_http::http::Error) -> Self {
        AppError::HttpError(err.to_string())
    }
}

impl AppError {
    pub fn status_code(&self) -> u16 {
        match self {
            AppError::InvalidBody(_) | AppError::ValidationError(_) => 400,
            AppError::NotFound(_) => 404,
            AppError::Internal(_) | AppError::HttpError(_) => 500,
        }
    }

    pub fn to_response(&self) -> Result<Response<Body>, lambda_http::Error> {
        let body = ApiErrorResponse {
            error: format!("{:?}", self).to_uppercase(),
            message: self.to_string(),
        };
        Ok(Response::builder()
            .status(self.status_code())
            .header("Content-Type", "application/json")
            .header("Access-Control-Allow-Origin", "*")
            .body(Body::Text(serde_json::to_string(&body)?))?)
    }
}
