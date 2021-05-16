var cors = require('cors')
const awsServerlessExpress = require('aws-serverless-express')
const awsServerlessExpressMiddleware = require('aws-serverless-express/middleware')
const express = require('express')
const { Pool } = require('pg')
const { postgraphile, makePluginHook } = require("postgraphile");
const PgSimplifyInflectorPlugin = require('@graphile-contrib/pg-simplify-inflector');
const pluginHook = makePluginHook([require("@graphile/pro").default]);

const app = express();

const stage = process.env.STAGE;

const pool = new Pool({
	host: process.env.DB_HOST,
	port: process.env.DB_PORT,
	database: stage,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD
});

app.use(cors({
	origin: 'https://www.openlaw.nz',
	optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs)
}));

app.use(awsServerlessExpressMiddleware.eventContext());

app.use(postgraphile(
	pool,
	'main', {
	license: process.env.GRAPHILE_LICENSE,
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
	readCache: `${__dirname}/postgraphile.cache`,
}
));

const server = awsServerlessExpress.createServer(app);

exports.handler = (event, context) => {
	awsServerlessExpress.proxy(server, event, context);
};
