# Build stage
FROM golang:1.24-alpine AS builder

# CGO is required by go-ethereum (secp256k1)
RUN apk add --no-cache gcc musl-dev linux-headers

WORKDIR /app

# Cache dependencies separately from source
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o server ./cmd/api/main.go

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/

COPY --from=builder /app/server .

# Create uploads directory for local storage
RUN mkdir -p uploads

EXPOSE 8080

CMD ["./server"]
