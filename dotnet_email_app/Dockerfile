# --------------------------------------------------------------------------
# Stage 1: build & publish
# --------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY EmailApp.csproj ./
RUN dotnet restore EmailApp.csproj

COPY . .
RUN dotnet publish EmailApp.csproj -c Release -o /app/publish --no-restore

# --------------------------------------------------------------------------
# Stage 2: runtime image
# --------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

# Directory for the SQLite database + Data Protection keys
# (mounted as a volume in docker-compose)
RUN mkdir -p /app/data

EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080

ENTRYPOINT ["dotnet", "EmailApp.dll"]
