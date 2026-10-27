# Stage 1: dev dependencies and the mock-DB test suite. The image build fails if a test fails.
# decision-record and compose-runtime-config need repo-root files outside this build context; CI runs them.
FROM node:20-alpine AS test
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV JWT_SECRET=image-build-test-secret-longer-than-32-characters
RUN npm run lint:guards && npm test -- --runInBand --testPathIgnorePatterns 'decision-record|compose-runtime-config' && touch /app/.tests-passed

# Stage 2: production dependencies only.
FROM node:20-alpine
WORKDIR /app

# Headless Chromium prints Arabic PDFs (src/utils/htmlPdf.js); the OFL fonts ship in assets/fonts.
RUN apk add --no-cache chromium
ENV PDF_CHROMIUM_PATH=/usr/bin/chromium
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
# Forces the test stage to run; the marker proves it passed.
COPY --from=test /app/.tests-passed /tmp/.tests-passed

RUN mkdir -p uploads && chown -R node:node /app

ENV NODE_ENV=production UV_THREADPOOL_SIZE=16
EXPOSE 5000
USER node

CMD ["npm", "start"]
