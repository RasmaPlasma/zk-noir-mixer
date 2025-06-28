# ZK Noir Mixer

A zero-knowledge cryptocurrency mixer built with Noir circuits and Barretenberg proving system. This project demonstrates privacy-preserving transactions using zero-knowledge proofs, allowing users to deposit and withdraw funds without revealing the connection between deposits and withdrawals.

## Architecture

### Noir Circuit (`src/main.nr`)
- Verifies commitment membership in Merkle tree
- Ensures commitment was created with provided secret, nullifier, and amount
- Generates nullifier hash to prevent double-spending
- Uses Poseidon2 hash function for all cryptographic operations

## Installation

1. Clone the repository:
```bash
git clone https://github.com/RasmaPlasma/zk-noir-mixer.git
cd zk-noir-mixer
```

2. Install dependencies:
```bash
npm install
```

3. Build the Noir circuit:
```bash
nargo build
```

## Usage

### Run the Demo

The mixer demo demonstrates the complete flow: deposits, withdrawals, and double-spending prevention.

```bash
npm run start
```

This will:
1. Generate 7 random commitments and deposit them
2. Perform 5 withdrawals in random order
3. Attempt a double-spending attack (which will fail)
4. Display all results

## Circuit Details

### Public Inputs
- `root`: Merkle tree root (proves commitment exists)
- `recipient`: Withdrawal address
- `nullifier_hash`: Prevents double-spending (output)

### Private Inputs
- `secret`: Random value known only to depositor
- `nullifier`: Unique value for each deposit
- `merkle_path`: Proof that commitment is in tree
- `leaf_index`: Position of commitment in tree
- `amount`: Value being withdrawn

## Limitations

- **Demo Only**: This is a proof-of-concept
- **No Smart Contract**: Currently only implements the cryptographic layer
- **Fixed Tree Size**: 20-level tree only supports up to 1M deposits

## Acknowledgments

- [Noir](https://noir-lang.org/) - Zero-knowledge programming language
- [Aztec](https://aztec.network/) - Barretenberg proving system
- [Tornado Cash](https://tornado.cash/) - Inspiration for mixer design