# TinyGo
```bash
sudo apt update
sudo apt install -y build-essential clang lld libssl-dev
```

```bash
VERSION=0.37.0
wget https://github.com/tinygo-org/tinygo/releases/download/v${VERSION}/tinygo${VERSION}.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf tinygo${VERSION}.linux-amd64.tar.gz
```

```bash
echo 'export PATH=$PATH:/usr/local/tinygo/bin' >> ~/.bashrc
source ~/.bashrc
```

```bash
tinygo version
```

# 
```bash

npm create vite@latest fronend -- --template react-ts
cd fronend
npm install
npm run dev
```

```bash
npm install @duckdb/duckdb-wasm apache-arrow ag-grid-community ag-grid-react
npm i @duckdb/duckdb-wasm@^1.29 apache-arrow
```