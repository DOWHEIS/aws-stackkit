import {createApi} from "../src/index";

const api = createApi({
    name: 'User API',
    description: 'Simple user api, created with the API Builder SDK',
    cors: true,
    database: {
        name: 'user_api_db',
        migrationsPath: './migrations'
    },
})

api.addRoute({
    path: '/users',
    method: 'POST',
    lambda: './functions/createUser.ts',
    auth: true
})

api.addRoute({
    path: '/users',
    method: 'GET',
    lambda: './functions/listUsers.ts',
    auth: true
})

api.addRoute({
    path: '/users/{id}',
    method: 'GET',
    lambda: './functions/getUser.ts',
    auth: true,
})

api.addRoute({
    path: '/users/{id}',
    method: 'DELETE',
    lambda: './functions/deleteUser.ts',
})

api.addAuth(auth)

function auth(event) {
return { user: "drew"}
}

export default api

