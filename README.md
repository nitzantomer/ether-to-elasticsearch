# ether-to-elasticsearch

A node program for dumping ethereum data into  elasticsearch.

A detailed explenation can be found here: [Ethereum Insights with Elasticsearch and Kibana](https://medium.com/kin-contributors/ethereum-insights-with-elasticsearch-and-kibana-669f020fda87).

## Running
Currently not in npm, so first clone/fork this repo and then:

```
npm install
npm run build
node scripts/bin/index.js
```

## Docker
```
docker-compose up
```
Then in your browser navigate to `http://localhost:5601`

## ElasticSearch Setup
Run the `./put_mapping.sh` script to create index template mapping.
Open kibana management panel > `Saved Objects` > `import` and then choose `kibana_export.json`.
