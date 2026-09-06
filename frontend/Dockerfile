FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Relative path so the built bundle calls same-origin /api, regardless of
# the public domain — nginx below proxies that to the backend container.
ENV REACT_APP_API_URL=
# Pre-existing ESLint unused-var warnings in a few Part 1 pages otherwise
# fail the build under CI=true.
ENV CI=false
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
