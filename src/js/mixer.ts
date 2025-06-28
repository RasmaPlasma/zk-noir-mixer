const tree = require("./merkleTree");

async function mixer() {
    console.log("Starting Noir mixer demo...");

    // Generate and deposit commitments
    const deposits = [];
    for (let i = 0; i < 7; i++) {
        const commitment = await tree.generateCommitment('1000000000000000000'); // 1 ETH
        console.log(`Depositing commitment ${i}:`);
        const deposit = await tree.deposit(commitment.commitment, commitment.amount);
        deposits.push({ ...commitment, ...deposit });
    }

    // Wait a bit to simulate time passing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Perform withdrawals
    const withdrawalIndices = [4, 0, 6, 3, 5];
    
    for (const index of withdrawalIndices) {
        try {
            const commitment = deposits[index];
            console.log(`Withdrawing commitment ${index}:`);
            
            // Get merkle path
            const path = await tree.getMerklePath(commitment.commitment);
            
            // Prepare inputs for proof generation
            const proofInputs = {
                root: path.root,
                recipient: '0x742d35Cc6634C0532925a3b8D3Ac92d4Outgoing61d',
                secret: commitment.secret,
                nullifier: commitment.nullifier,
                pathElements: path.pathElements,
                leafIndex: path.leafIndex,
                amount: commitment.amount
            };
            
            // Generate proof
            const { proof, publicInputs } = await tree.generateProof(proofInputs);
            
            // Attempt withdrawal
            await tree.withdraw(proof, publicInputs, proofInputs.recipient);
            
        } catch (error) {
            console.error(`Withdrawal ${index} failed:`, error.message);
        }
    }

    // Test double spending
    console.log("Testing double spending...");
    try {
        const commitment = deposits[5];
        const path = await tree.getMerklePath(commitment.commitment);
        
        const proofInputs = {
            root: path.root,
            recipient: '0x742d35Cc6634C0532925a3b8D3Ac92d421f4061d',
            secret: commitment.secret,
            nullifier: commitment.nullifier,
            pathElements: path.pathElements,
            leafIndex: path.leafIndex,
            amount: commitment.amount
        };
        
        const { proof, publicInputs } = await tree.generateProof(proofInputs);
        await tree.withdraw(proof, publicInputs, proofInputs.recipient);
        
    } catch (error) {
        console.log("Double spending correctly prevented:", error.message);
    }

    console.log("Mixer demo completed!");
}

mixer().then(() => {
    process.exit(0);
}).catch(error => {
    console.error("Mixer demo failed:", error);
    process.exit(1);
});