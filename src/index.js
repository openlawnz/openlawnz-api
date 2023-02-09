import awsServerlessExpress from 'aws-serverless-express';
import awsServerlessExpressMiddleware from 'aws-serverless-express/middleware';
import express from 'express';
import { Pool }  from 'pg';
import { postgraphile, makePluginHook } from "postgraphile";
import PgSimplifyInflectorPlugin from '@graphile-contrib/pg-simplify-inflector';
import graphilePro from '@graphile/pro';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const pluginHook = makePluginHook([graphilePro]);

const client = new SecretsManagerClient({ region: "ap-southeast-2" });

const command = new GetSecretValueCommand({
	SecretId: process.env.SECRET_ARN
});
const response = await client.send(command);

if(!response.SecretString) {
	process.exit();
}
const secretJSON = JSON.parse(response.SecretString);

const DB_HOST = secretJSON["DB_HOST"];
const DB_PORT = secretJSON["PORT"];
const DB_USER = secretJSON["DB_USER"];
const DB_PASSWORD = secretJSON["DB_PASSWORD"];
const GRAPHILE_LICENSE = secretJSON["GRAPHILE_LICENSE"];

const app = express();

const stage = process.env.STAGE;

const pool = new Pool({
	host: DB_HOST,
	port: DB_PORT,
	database: stage,
	user: DB_USER,
	password: DB_PASSWORD
});

app.use(awsServerlessExpressMiddleware.eventContext());

app.use(postgraphile(
	pool,
	'main', {
	license: GRAPHILE_LICENSE,
	pluginHook,
	enableCors: true,
	graphiql: true,
	enhanceGraphiql: true,
	graphqlRoute: '/graphql',
	//readOnlyConnection: true,
	defaultPaginationCap: -1,
	graphqlDepthLimit: 50000,
	graphqlCostLimit: 50000,
	exposeGraphQLCost: false,
	appendPlugins: [
		PgSimplifyInflectorPlugin,
	],
	//core
	graphileBuildOptions: {
		pgOmitListSuffix: true,
	},
	watchPg: false,
	simpleCollections: 'only',
	disableDefaultMutations: true,
	ignoreRBAC: false,
}
));

const server = awsServerlessExpress.createServer(app);

export const handler = async (event, context) => {
	awsServerlessExpress.proxy(server, event, context);
};
