# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added `withTokenBucket` helper function, which executes a callback with an appropriate
  delay according to a provided `HierarchicalTokenBucket`.
- Added an option to create a child with no options (ie. `child()`) and inherit the 
  maximumCapacity and refillRate from the parent.

## 0.1.0 - 2022-05-05

### Added

- Released `HierarchicalTokenBucket`