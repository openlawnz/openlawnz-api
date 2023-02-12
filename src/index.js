const serverlessExpress = require('@vendia/serverless-express')
const awsServerlessExpressMiddleware = require('@vendia/serverless-express/src/middleware')
const express = require('express')
const { Pool } = require('pg')
const { postgraphile, makePluginHook } = require("postgraphile");
const PgSimplifyInflectorPlugin = require('@graphile-contrib/pg-simplify-inflector');
const pluginHook = makePluginHook([require("@graphile/pro").default]);
const stage = process.env.STAGE;
const app = express();

let serverlessExpressInstance

async function setup(event, context) {
	const response = await fetch(`http://localhost:2773/secretsmanager/get?secretId=${process.env.SECRET_ARN}`, {
		headers: {
			"X-Aws-Parameters-Secrets-Token": process.env.AWS_SESSION_TOKEN
		},
    });
    const secretJSON = JSON.parse((await response.json()).SecretString);
	
	const DB_HOST = secretJSON["DB_HOST"];
	const DB_PORT = secretJSON["PORT"];
	const DB_USER = secretJSON["DB_USER"];
	const DB_PASSWORD = secretJSON["DB_PASSWORD"];
	const GRAPHILE_LICENSE = secretJSON["GRAPHILE_LICENSE"];
	
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
		graphiql: stage === "dev",
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

	serverlessExpressInstance = serverlessExpress({ app })
	return serverlessExpressInstance(event, context)
}

function handler(event, context) {
	if (serverlessExpressInstance) return serverlessExpressInstance(event, context)
	return setup(event, context)
}

exports.handler = handler