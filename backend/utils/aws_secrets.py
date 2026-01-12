# utils/aws_secrets.py
import boto3
import json
import os
from functools import lru_cache
from botocore.exceptions import ClientError

@lru_cache(maxsize=1)
def get_rds_credentials():
    """
    Retrieve RDS credentials from AWS Secrets Manager
    Cached to avoid repeated API calls
    
    Returns dict with keys: username, password, host, port, dbname
    """
    secret_name = os.getenv('RDS_SECRET_NAME')
    region_name = os.getenv('AWS_REGION', 'ap-southeast-2')
    
    if not secret_name:
        raise ValueError("RDS_SECRET_NAME not set in environment")
    
    print(f"   Fetching secret: {secret_name}")
    print(f"   Region: {region_name}")
    
    # Create a Secrets Manager client
    session = boto3.session.Session()
    client = session.client(
        service_name='secretsmanager',
        region_name=region_name
    )
    
    try:
        get_secret_value_response = client.get_secret_value(
            SecretId=secret_name
        )
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'ResourceNotFoundException':
            raise ValueError(f"Secret '{secret_name}' not found in region {region_name}")
        elif error_code == 'InvalidRequestException':
            raise ValueError(f"Invalid request for secret '{secret_name}'")
        elif error_code == 'InvalidParameterException':
            raise ValueError(f"Invalid parameter for secret '{secret_name}'")
        elif error_code == 'DecryptionFailure':
            raise ValueError(f"Cannot decrypt secret '{secret_name}'")
        elif error_code == 'InternalServiceError':
            raise ValueError(f"Internal service error retrieving secret '{secret_name}'")
        elif error_code == 'AccessDeniedException':
            raise ValueError(f"Access denied to secret '{secret_name}'. Check IAM permissions.")
        else:
            raise ValueError(f"Error retrieving secret: {error_code} - {str(e)}")
    
    # Parse secret
    secret = json.loads(get_secret_value_response['SecretString'])
    
    # AWS auto-generated secrets have this structure, but fallback to env vars if missing
    credentials = {
        'username': secret.get('username') or os.getenv('RDS_USER'),
        'password': secret.get('password'),
        'host': secret.get('host') or os.getenv('RDS_ENDPOINT'),
        'port': secret.get('port', 5432),
        'dbname': secret.get('dbname') or os.getenv('RDS_DATABASE')
    }
    
    print(f"   Successfully retrieved credentials for user: {credentials['username']}")
    print(f"   Host: {credentials['host']}")
    print(f"   Database: {credentials['dbname']}")
    
    return credentials