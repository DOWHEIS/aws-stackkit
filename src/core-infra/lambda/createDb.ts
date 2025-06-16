import {
  RDSDataClient,
  ExecuteStatementCommand,
} from '@aws-sdk/client-rds-data'
import type { CloudFormationCustomResourceEvent } from 'aws-lambda'

const client = new RDSDataClient({})

export const main = async (event: CloudFormationCustomResourceEvent) => {
  console.log('Event:', JSON.stringify(event))
  const dbName = event.ResourceProperties.DB_NAME
  const secretArn = process.env.DB_SECRET_ARN!
  const clusterArn = process.env.CLUSTER_ARN!

  if (!dbName || !secretArn || !clusterArn) {
    console.error('Missing required values')
    throw new Error('Missing DB_NAME, DB_SECRET_ARN, or CLUSTER_ARN')
  }

  if (event.RequestType !== 'Create') {
    console.log(`Not a Create event, skipping: ${event.RequestType}`)
    return { PhysicalResourceId: dbName }
  }

  try {
    console.log('Warming up cluster with SELECT 1...')
    await client.send(new ExecuteStatementCommand({
      secretArn,
      resourceArn: clusterArn,
      database: 'postgres',
      sql: 'SELECT 1;',
    }))
    console.log('Cluster is responsive.')
  } catch (e) {
    console.warn('Warm-up failed, continuing anyway...', e)
  }

  try {
    console.log(`Creating database if not exists: ${dbName}`)
    const result = await client.send(new ExecuteStatementCommand({
      secretArn,
      resourceArn: clusterArn,
      database: 'postgres',
      sql: `CREATE DATABASE "${dbName}"`,
    }))
    console.log('Database create command result:', result)
  } catch (err) {
    console.error('Failed to create database:', err)
    throw err
  }

  return { PhysicalResourceId: dbName }
}
