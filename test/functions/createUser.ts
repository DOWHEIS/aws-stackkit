import { APIGatewayProxyEvent } from 'aws-lambda'
import { insert } from '../../src/api/db'
import {Bullshit} from "./someBullshit";

type CreateUserInput = {
    name: string
    email: string
}

export default async function handler(event: APIGatewayProxyEvent) {
    let body: Partial<CreateUserInput> = {}

    try {
        body = JSON.parse(event.body || '{}')
    } catch {
        return { statusCode: 400, body: 'Invalid JSON' }
    }

    const { name, email } = body
    if (!name || !email) {
        return { statusCode: 400, body: 'Missing name or email' }
    }

    try {
        await insert<CreateUserInput>('users', { name, email })
        return { statusCode: 200, body: 'User created' }
    } catch (err) {
        console.error(err)
        return { statusCode: 500, body: 'Error creating user' }
    }
}
