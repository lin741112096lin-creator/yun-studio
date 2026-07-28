import serverless from "serverless-http";
import { app } from "../server";

const expressHandler = serverless(app);

export async function main(event: any, context: any) {
  return expressHandler(event, context);
}
