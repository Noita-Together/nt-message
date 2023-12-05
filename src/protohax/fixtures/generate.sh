#!/bin/bash

HERE="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

(
  cd "$HERE/../../.." && \
  npx pbjs -w commonjs -t static-module ./src/protohax/fixtures/protohax.proto > ./src/protohax/fixtures/protohax_pb.js && \
  npx pbts ./src/protohax/fixtures/protohax_pb.js > ./src/protohax/fixtures/protohax_pb.d.ts && \
  npx pbjs -t json ./src/protohax/fixtures/protohax.proto > ./src/protohax/fixtures/protohax_pb.json
)