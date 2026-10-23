FROM node:20-alpine

LABEL org.opencontainers.image.title="Estonia Company Data Pipeline"
LABEL org.opencontainers.image.description="Discover new Estonian companies from free e-Business Register open data, detect websites, sync official contacts to Google Sheets"
LABEL org.opencontainers.image.source="https://github.com/Alinaveedbutt/Estonia-DataScrapper"

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

CMD ["npm", "start"]
