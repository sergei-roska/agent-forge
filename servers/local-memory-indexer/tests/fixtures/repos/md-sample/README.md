# Project Overview

This is the introduction paragraph. It provides background on project goals and motivation.

## Features

The first feature is semantic indexing of large codebases. This enables fast similarity search across thousands of files without loading them into memory.

The second feature is hybrid search that combines vector similarity with BM25 keyword matching. Exact technical terms like `useEffect` or specific error codes are never lost in semantic fuzziness.

## Installation

Install the package using your preferred package manager.

Configure the required environment variables before running the server for the first time.

## Usage

Import the module and call the `start_indexing` tool with your project path. The indexer runs in the background and returns a run_id immediately.

Use `get_indexing_status` to monitor progress. Phase 1 scans and chunks files; Phase 2 generates embeddings.
