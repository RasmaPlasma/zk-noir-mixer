use std::hash::poseidon2;

pub fn verify_merkle_path<let DEPTH: u32>(
    leaf: Field, 
    index: u32, 
    merkle_path: [Field; DEPTH], 
    root: Field
) -> bool {
    let mut current = leaf;
    
    for i in 0..DEPTH {
        let path_bit = (index >> (i as u8)) & 1 == 1;
        
        if path_bit {
            current = poseidon2::Poseidon2::hash([merkle_path[i], current], 2); 
        } else {
            current = poseidon2::Poseidon2::hash([current, merkle_path[i]], 2);
        }
    }
    
    current == root
} 