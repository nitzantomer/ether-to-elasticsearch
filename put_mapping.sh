#!/bin/sh

curl -XPUT http://$ELASTICSEARCH/_template/logging --data "@mapping.json"
