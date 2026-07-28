import serverless from "serverless-http";
import { app } from "../server";

const expressHandler = serverless(app);

const port = Number(process.env.PORT || 9000);
app.listen(port, "0.0.0.0", () => {
  console.log(`CloudBase API server listening on port ${port}`);
});

export async function main(event: any, context: any) {
  return expressHandler(event, context);
}
