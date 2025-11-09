import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { readFileSync } from "fs";
import { join } from "path";
import { createResolvers } from "./resolvers.js";
import type { Pipeline } from "../core/pipeline.js";
import { logger } from "../core/logger.js";

const log = logger.child("GraphQL");

let graphqlServer: any = null;

export async function registerGraphQLServer(pipeline: Pipeline): Promise<void> {
  const typeDefs = readFileSync(join(process.cwd(), "schema.graphql"), "utf-8");
  const resolvers = createResolvers(pipeline);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  // Start standalone server on a different port for GraphQL
  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
    context: async () => ({}),
  });

  graphqlServer = server;
  log.info(`GraphQL server ready at ${url}`);
}

export function getGraphQLServer() {
  return graphqlServer;
}
