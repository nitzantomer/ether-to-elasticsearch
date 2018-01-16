import * as elasticsearch from "elasticsearch";
import { getErrorMessage } from "./utils";
import { processBlock, getLastBlockNumber, ProcessedTransaction } from "./processor";

import dateFormat = require("dateformat");
const pjson = require("../../package.json");
const VERSION = pjson.version as string;

import commander = require("commander");
declare module "commander" {
	interface ICommand {
		startBlock?: string;
		endBlock?: string;
	}
}

type BulkEntryIndex = {
	index: {
		_index: string;
		_type: "transaction";
		_id: string;
	}
}

function createBulkEntry(transaction: ProcessedTransaction): [BulkEntryIndex, ProcessedTransaction] {
	return [{
		index: {
			_index: `transactions-${ dateFormat(new Date(), "yyyy-mm-dd") }`,
			_type: "transaction",
			_id: transaction.hash
		}
	}, transaction];
}

function postTransactions(transactions: ProcessedTransaction[]) {
	const bulkBody = transactions
		.map(createBulkEntry)
		.reduce((a, b) => a.concat(b), []);

	elasticsearchClient.bulk({
		body: bulkBody
	}, (err, resp) => {
		if (err) {
			console.log("\terror sending bulk: ", err);
		} else {
			console.log("\tbulk sent successfully");
		}
	});
}

commander
	.version(VERSION)
	.option("--start-block [number]", "The block number to start with")
	.option("--end-block [number]", "The block number to stop at")
	.parse(process.argv);

console.log(`connecting to elasticsearch at: ${ process.env.ELASTICSEARCH }`);
const elasticsearchClient = new elasticsearch.Client({
	host: process.env.ELASTICSEARCH,
	/*log: [
		{
			type: "file",
			level: "error",
			path: "logs/elasticsearch.error.log"
		},
		{
			type: "file",
			level: "trace",
			path: "logs/elasticsearch.log"
		}
	]*/
});

async function iterator(current: number, end: number | null): Promise<number> {
	const latestBlockNumber = await getLastBlockNumber();

	end = Math.min(latestBlockNumber, end || latestBlockNumber);
	while (current <= end) {
		try {
			postTransactions(await processBlock(current));
			current++;
		} catch (e) {
			console.log(`failed to retrieve last block: ${ getErrorMessage(e) }`);
			return current;
		}
	}

	return current;
}

async function main() {
	let resolvePromise: Function;
	const promise = new Promise<void>(resolve => {
		resolvePromise = resolve;
	});

	const endBlock = Number(commander.endBlock) || null;
	const startBlock = Number(commander.startBlock) || null;

	let lastProcessed = startBlock || await getLastBlockNumber();
	const thread = async () => {
		lastProcessed = await iterator(lastProcessed, endBlock);

		if (endBlock == null || lastProcessed < endBlock) {
			setTimeout(thread, 10000);
		} else {
			resolvePromise();
		}
	}
	await thread();

	return promise;
}

main().then(() => console.log("finished"));
