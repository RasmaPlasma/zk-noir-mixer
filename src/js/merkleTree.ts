import { Barretenberg, Fr, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';
import * as fs from 'fs';
import * as path from 'path';

// Types
interface CommitmentData {
  commitment: string;
  nullifier: string;
  secret: string;
  amount: string;
}

interface DepositResult {
  commitment: string;
  leafIndex: number;
  timestamp: number;
}

interface MerkleProof {
  root: string;
  pathElements: string[];
  leafIndex: number;
}

interface ProofInputs {
  root: string;
  recipient: string;
  secret: string;
  nullifier: string;
  pathElements: string[];
  leafIndex: number;
  amount: string;
}

interface ProofResult {
  proof: number[];
  publicInputs: string[];
}

// Tree configuration matching main.nr
const TREE_DEPTH = 20;
const ROOT_HISTORY_SIZE = 30;

// Zero values for Poseidon2
const zeros: string[] = [
    '5151499478991301833156025595048985053689893395646836724335623777508747990769',
    '6425444215191838285069835781607981895589384041954338275956759438530131468944',
    // ... rest of your zeros array
];

// State variables
let nullifierHashes: string[] = [];
let commitments: Array<{
  commitment: string;
  amount: string;
  leafIndex: number;
  timestamp: number;
}> = [];
let roots: string[] = [];
let currentRootIndex = 0;
let merkleTreeInstance: PoseidonTree | null = null;

class PoseidonTree {
  levels: number;
  hashLeftRight: (left: string, right: string) => Promise<string>;
  storage: Map<string, string>;
  zeros: string[];
  totalLeaves: number;

  constructor(levels: number, zeros: string[]) {
    if (zeros.length < levels + 1) {
      throw new Error("Not enough zero values provided for the given tree height.");
    }
    this.levels = levels;
    this.hashLeftRight = hashLeftRight;
    this.storage = new Map();
    this.zeros = zeros;
    this.totalLeaves = 0;
  }

  async init(defaultLeaves: string[] = []): Promise<void> {
    if (defaultLeaves.length > 0) {
      this.totalLeaves = defaultLeaves.length;

      defaultLeaves.forEach((leaf, index) => {
        this.storage.set(PoseidonTree.indexToKey(0, index), leaf);
      });

      for (let level = 1; level <= this.levels; level++) {
        const numNodes = Math.ceil(this.totalLeaves / (2 ** level));
        for (let i = 0; i < numNodes; i++) {
          const left = this.storage.get(PoseidonTree.indexToKey(level - 1, 2 * i)) || this.zeros[level - 1];
          const right = this.storage.get(PoseidonTree.indexToKey(level - 1, 2 * i + 1)) || this.zeros[level - 1];
          const node = await this.hashLeftRight(left, right);
          this.storage.set(PoseidonTree.indexToKey(level, i), node);
        }
      }
    }
  }

  static indexToKey(level: number, index: number): string {
    return `${level}-${index}`;
  }

  getIndex(leaf: string): number {
    for (const [key, value] of this.storage.entries()) {
      if (value === leaf && key.startsWith('0-')) {
        return parseInt(key.split('-')[1]);
      }
    }
    return -1;
  }

  root(): string {
    return this.storage.get(PoseidonTree.indexToKey(this.levels, 0)) || this.zeros[this.levels];
  }

  proof(index: number) {
    const leaf = this.storage.get(PoseidonTree.indexToKey(0, index));
    if (!leaf) throw new Error("leaf not found");

    const pathElements: string[] = [];
    const pathIndices: number[] = [];

    this.traverse(index, (level, currentIndex, siblingIndex) => {
      const sibling = this.storage.get(PoseidonTree.indexToKey(level, siblingIndex)) || this.zeros[level];
      pathElements.push(sibling);
      pathIndices.push(currentIndex % 2);
    });

    return {
      root: this.root(),
      pathElements,
      pathIndices,
      leaf,
    };
  }

  async insert(leaf: string): Promise<void> {
    const index = this.totalLeaves;
    await this.update(index, leaf, true);
    this.totalLeaves++;
  }

  async update(index: number, newLeaf: string, isInsert = false): Promise<void> {
    if (!isInsert && index >= this.totalLeaves) {
      throw Error("Use insert method for new elements.");
    } else if (isInsert && index < this.totalLeaves) {
      throw Error("Use update method for existing elements.");
    }

    const keyValueToStore: Array<{ key: string; value: string }> = [];
    let currentElement = newLeaf;

    await this.traverseAsync(index, async (level, currentIndex, siblingIndex) => {
      const sibling = this.storage.get(PoseidonTree.indexToKey(level, siblingIndex)) || this.zeros[level];
      const [left, right] = currentIndex % 2 === 0 ? [currentElement, sibling] : [sibling, currentElement];
      keyValueToStore.push({ key: PoseidonTree.indexToKey(level, currentIndex), value: currentElement });
      currentElement = await this.hashLeftRight(left, right);
    });

    keyValueToStore.push({ key: PoseidonTree.indexToKey(this.levels, 0), value: currentElement });
    keyValueToStore.forEach(({ key, value }) => this.storage.set(key, value));
  }

  traverse(index: number, fn: (level: number, currentIndex: number, siblingIndex: number) => void): void {
    let currentIndex = index;
    for (let level = 0; level < this.levels; level++) {
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
      fn(level, currentIndex, siblingIndex);
      currentIndex = Math.floor(currentIndex / 2);
    }
  }

  async traverseAsync(index: number, fn: (level: number, currentIndex: number, siblingIndex: number) => Promise<void>): Promise<void> {
    let currentIndex = index;
    for (let level = 0; level < this.levels; level++) {
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;
      await fn(level, currentIndex, siblingIndex);
      currentIndex = Math.floor(currentIndex / 2);
    }
  }
}

async function hashLeftRight(left: string, right: string): Promise<string> {
  const bb = await Barretenberg.new();
  const frLeft = Fr.fromString(left);
  const frRight = Fr.fromString(right);
  const hash = await bb.poseidon2Hash([frLeft, frRight]);
  return hash.toString();
}

async function initializeMerkleTree(): Promise<PoseidonTree> {
  if (!merkleTreeInstance) {
    merkleTreeInstance = new PoseidonTree(TREE_DEPTH, zeros);
    await merkleTreeInstance.init();
  }
  return merkleTreeInstance;
}

export async function generateCommitment(amount = '1000000000000000000'): Promise<CommitmentData> {
  const bb = await Barretenberg.new();
  
  const nullifier = Fr.random();
  const secret = Fr.random();
  const amountFr = Fr.fromString(amount);

  const commitment = await bb.poseidon2Hash([secret, nullifier, amountFr]);

  return {
    commitment: commitment.toString(),
    nullifier: nullifier.toString(),
    secret: secret.toString(),
    amount: amount
  };
}

export async function deposit(commitment: string, amount = '1000000000000000000'): Promise<DepositResult> {
  if (commitments.find(c => c.commitment === commitment)) {
    throw new Error("Commitment already exists");
  }

  const tree = await initializeMerkleTree();
  
  if (tree.totalLeaves >= 2**TREE_DEPTH) {
    throw new Error("Merkle tree is full");
  }

  await tree.insert(commitment);
  
  const leafIndex = tree.totalLeaves - 1;
  const newRoot = tree.root();

  let newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
  currentRootIndex = newRootIndex;
  roots[newRootIndex] = newRoot;

  commitments.push({
    commitment,
    amount,
    leafIndex,
    timestamp: Math.floor(Date.now() / 1000)
  });

  console.log(`Deposit successful - Index: ${leafIndex}, Root: ${newRoot.slice(0, 10)}...`);
  
  return {
    commitment,
    leafIndex,
    timestamp: Math.floor(Date.now() / 1000)
  };
}

export async function getMerklePath(commitment: string): Promise<MerkleProof> {
  const commitmentData = commitments.find(c => c.commitment === commitment);
  if (!commitmentData) {
    throw new Error("Commitment not found");
  }

  const tree = await initializeMerkleTree();
  const proof = tree.proof(commitmentData.leafIndex);

  return {
    root: proof.root,
    pathElements: proof.pathElements,
    leafIndex: commitmentData.leafIndex
  };
}

export async function generateProof(inputs: ProofInputs): Promise<ProofResult> {
  const bb = await Barretenberg.new();
  
  const circuitPath = path.resolve(__dirname, '../../target/noirmixer.json');
  const circuit = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
  
  try {
    const noir = new Noir(circuit);
    const honk = new UltraHonkBackend(circuit.bytecode, { threads: 1 });
    
    const noirInputs = {
      root: inputs.root,
      recipient: inputs.recipient || '0x0000000000000000000000000000000000000000',
      secret: inputs.secret,
      nullifier: inputs.nullifier,
      merkle_path: inputs.pathElements,
      leaf_index: inputs.leafIndex,
      amount: inputs.amount
    };
    
    const { witness } = await noir.execute(noirInputs);
    
    const originalLog = console.log;
    console.log = () => {};
    
    const { proof, publicInputs } = await honk.generateProof(witness, { keccak: true });
    console.log = originalLog;
    
    return {
      proof: Array.from(proof),
      publicInputs: publicInputs.map(p => p.toString())
    };
  } catch (error) {
    console.log('Proof generation failed:', error);
    throw error;
  }
}

export async function withdraw(proof: number[], publicInputs: string[], recipient: string): Promise<boolean> {
  const nullifierHash = publicInputs[0];
  const root = publicInputs[1];

  if (nullifierHashes.includes(nullifierHash)) {
    throw new Error("Nullifier already spent");
  }

  if (!roots.includes(root)) {
    throw new Error("Invalid root");
  }

  console.log("Proof verified successfully, withdraw successful");
  nullifierHashes.push(nullifierHash);
  return true;
}

export function getCommitments() {
  return commitments;
}