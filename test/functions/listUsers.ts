import { selectAll } from '../../src/api/db.js'

type User = {
    id: number
    name: string
    email: string
    created_at: string
}

export default async function listUsers(event: { ssoUser: any }) {
    try {
        console.log(event.ssoUser)
        const users = await selectAll<User>(
            'SELECT id, name, email, created_at FROM users ORDER BY id'
        )

        return {
            statusCode: 200,
            body: JSON.stringify({ users, ssoUser: event.ssoUser }),
        }
    } catch (err) {
        console.error(err)
        return { statusCode: 500, body: 'Failed to fetch users' }
    }
}
