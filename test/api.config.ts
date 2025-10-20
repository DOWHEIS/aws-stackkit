import {createApi} from "aws-stackkit";
import createUser from "./functions/createUser";
import listUsers from "./functions/listUsers";
import getUser from "./functions/getUser";
import deleteUser from "./functions/deleteUser";

const api = createApi({
    name: 'User API',
    description: 'Simple user api, created with the API Builder SDK',
    cors: true,
    database: {
        name: 'user_api_db',
        migrationsPath: './migrations'
    },
    apiKeys: {enabled: true},
})

api.addRoute({
    path: '/users',
    method: 'POST',
    lambda: createUser,
    auth: { type: 'apiKey' },
})

api.addRoute({
    path: '/users',
    method: 'GET',
    lambda: listUsers,
    auth: { type: 'apiKey' }
})

api.addRoute({
    path: '/users/{id}',
    method: 'GET',
    lambda: getUser,
})

api.addRoute({
    path: '/users/{id}',
    method: 'DELETE',
    lambda: deleteUser,
})

// api.addAuth(auth)
//
// function auth(event) {
// return { user: "drew"}
// }

export default api

