# Stage 1: dev dependencies and the mock-DB test suite. The image build fails if a test fails.
# decision-record.test.js checks docs/ at the repo root, which is outside this build context; CI runs it.
FROM node:20-alpine AS test
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV JWT_SECRET=image-build-test-secret-longer-than-32-characters
RUN npm run lint:guards && npm test -- --runInBand --testPathIgnorePatterns decision-record && touch /app/.tests-passed

# Stage 2: production dependencies only.
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
# Forces the test stage to run; the marker proves it passed.
COPY --from=test /app/.tests-passed /tmp/.tests-passed

RUN mkdir -p uploads

ENV NODE_ENV=production
EXPOSE 5000

CMD ["npm", "run", "start:migrated"]
