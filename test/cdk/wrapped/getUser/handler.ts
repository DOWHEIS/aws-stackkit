import { APIGatewayProxyEvent } from "aws-lambda";
import { selectOne } from "../shared/db";

type User = {
  id: number;
  name: string;
  email: string;
  created_at: string;
};

export default async function handler(event: APIGatewayProxyEvent) {
  const id = event.pathParameters?.id;
  console.log(`Fetching user with ID: ${id}`);

  if (!id) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "text/html" },
      body: `<h1>Missing user ID</h1>`,
    };
  }

  try {
    const user = await selectOne<User>(
      "SELECT id, name, email, created_at FROM users WHERE id = :id",
      { id: Number(id) }
    );

    if (!user) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "text/html" },
        body: `<h1>User Not Found</h1>`,
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: `
                <h1>User Info</h1>
                <ul>
                    <li><b>ID:</b> ${user.id}</li>
                    <li><b>Name:</b> ${user.name}</li>
                    <li><b>Email:</b> ${user.email}</li>
                    <li><b>Created:</b> ${user.created_at}</li>
                </ul>
            `.trim(),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/html" },
      body: `<h1>Error fetching user</h1>`,
    };
  }
}
