#!/usr/bin/env sh

# GoToMock Quick Start Script
# This script helps you get the development environment running quickly

printf '%s\n' "🚀 Setting up GoToMock Development Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Compose command detection (supports both Compose v1 and v2)
COMPOSE_CMD=""

if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
else
    if command -v docker >/dev/null 2>&1; then
        # docker compose is a subcommand; verify it exists
        if docker compose version >/dev/null 2>&1; then
            COMPOSE_CMD="docker compose"
        fi
    fi
fi

# Check if Docker is installed
if ! command -v docker >/dev/null 2>&1; then
    printf '%b\n' "${RED}Docker is not available in this shell.${NC}"
    printf '%b\n' "${YELLOW}On Windows, run from PowerShell instead:${NC}"
    printf '%s\n' "  .\\start.ps1 start"
    printf '%b\n' "${YELLOW}Or run docker compose directly:${NC}"
    printf '%s\n' "  docker compose up --build -d"
    printf '%b\n' "${YELLOW}If you are in WSL, install a real distro (Ubuntu) and enable Docker Desktop WSL integration.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if [ -z "${COMPOSE_CMD}" ]; then
    printf '%b\n' "${RED}Docker Compose is not available. Install Docker Desktop (includes Compose v2) or docker-compose.${NC}"
    exit 1
fi

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    printf '%b\n' "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env
    printf '%b\n' "${YELLOW}Please edit .env file and add your API keys before running the application.${NC}"
fi

# Function to start the application
start_app() {
    printf '%b\n' "${GREEN}Starting GoToMock application...${NC}"
    ${COMPOSE_CMD} up --build -d
    
    printf '%b\n' "${GREEN}Waiting for services to be ready...${NC}"
    sleep 10
    
    printf '%b\n' "${GREEN}✅ GoToMock is now running!${NC}"
    printf '%s\n' ""
    printf '%b\n' "${GREEN}📱 Frontend:${NC} http://localhost:5173"
    printf '%b\n' "${GREEN}🔧 Backend API:${NC} http://localhost:8000"
    printf '%b\n' "${GREEN}📚 API Documentation:${NC} http://localhost:8000/docs"
    printf '%b\n' "${GREEN}🗄️  Database:${NC} localhost:3307 (container 3306)"
    printf '%s\n' ""
    printf '%b\n' "${YELLOW}To view logs:${NC} ${COMPOSE_CMD} logs -f"
    printf '%b\n' "${YELLOW}To stop:${NC} ${COMPOSE_CMD} down"
}

# Function to stop the application
stop_app() {
    printf '%b\n' "${YELLOW}Stopping GoToMock application...${NC}"
    ${COMPOSE_CMD} down
    printf '%b\n' "${GREEN}✅ Application stopped.${NC}"
}

# Function to view logs
view_logs() {
    ${COMPOSE_CMD} logs -f
}

# Function to clean up everything
cleanup() {
    printf '%b\n' "${YELLOW}Cleaning up Docker containers, images, and volumes...${NC}"
    ${COMPOSE_CMD} down -v --rmi all
    printf '%b\n' "${GREEN}✅ Cleanup completed.${NC}"
}

# Parse command line arguments
case "$1" in
    start)
        start_app
        ;;
    stop)
        stop_app
        ;;
    restart)
        stop_app
        start_app
        ;;
    logs)
        view_logs
        ;;
    clean)
        cleanup
        ;;
    *)
        printf '%s\n' "GoToMock Development Environment Manager"
        printf '%s\n' ""
        printf '%s\n' "Usage: $0 {start|stop|restart|logs|clean}"
        printf '%s\n' ""
        printf '%s\n' "Commands:"
        printf '%s\n' "  start   - Start the application"
        printf '%s\n' "  stop    - Stop the application"
        printf '%s\n' "  restart - Restart the application"
        printf '%s\n' "  logs    - View application logs"
        printf '%s\n' "  clean   - Clean up all containers and volumes"
        printf '%s\n' ""
        exit 1
        ;;
esac