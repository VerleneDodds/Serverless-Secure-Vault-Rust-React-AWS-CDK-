use aws_config::meta::region::RegionProviderChain;
use aws_sdk_dynamodb::Client as DynamoDbClient;
use aws_sdk_s3::Client as S3Client;
use lambda_http::{run, service_fn, Error, Request};
use tracing::info;

use secure_storage_solution::handlers::handle_request;

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .with_target(false)
        .without_time()
        .init();

    info!("Initializing Secure Storage Service v0.4.0...");

    let region_provider = RegionProviderChain::default_provider().or_else("us-east-1");
    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region_provider)
        .load()
        .await;

    let s3_client = S3Client::new(&config);
    let dynamodb_client = DynamoDbClient::new(&config);

    run(service_fn(|req: Request| {
        let s3 = &s3_client;
        let dynamo = &dynamodb_client;
        async move { handle_request(req, s3, dynamo).await }
    }))
    .await
}
