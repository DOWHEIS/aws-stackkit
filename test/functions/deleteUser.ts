import { APIGatewayProxyEvent } from 'aws-lambda'
// import { exec } from 'aws-stackkit'
import {Bullshit} from "./someBullshit";

export default async function deleteUser(event: APIGatewayProxyEvent) {
    const id = event.pathParameters?.id
    if (!id) return { statusCode: 400, body: 'Missing user ID' }

    console.log(Bullshit)

    try {
        // await exec('DELETE FROM users WHERE id = :id', {
        //     id: Number(id),
        // })
        return { statusCode: 200, body: 'User deleted' }
    } catch (err) {
        console.error(err)
        return { statusCode: 500, body: 'Error deleting user' }
    }
}
