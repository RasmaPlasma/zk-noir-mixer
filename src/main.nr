use std::hash::poseidon2;
mod merkle;

global TREE_DEPTH: u32 = 20;

fn main(
    //public inputs
    root: pub Field,
    recipient: pub Field,

    //private inputs
    secret: Field,
    nullifier: Field, 
    merkle_path: [Field; TREE_DEPTH],
    leaf_index: u32,
    amount: Field
    
) -> pub Field {
    // Reconstruct commitment
    let commitment = poseidon2::Poseidon2::hash([secret, nullifier, amount], 3);
    
    // Verify commitment exists in Merkle tree
    let is_valid = merkle::verify_merkle_path(commitment, leaf_index, merkle_path, root);
    assert(is_valid);
    
    // Calculate nullifier hash to prevent double-spending
    let nullifier_hash = poseidon2::Poseidon2::hash([nullifier], 2);
    
    // Return nullifier hash as public output
    nullifier_hash
}