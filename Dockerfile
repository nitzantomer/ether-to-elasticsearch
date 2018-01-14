FROM node:9
WORKDIR /home/node/app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

CMD [ "node", "scripts/bin/index.js" ]
