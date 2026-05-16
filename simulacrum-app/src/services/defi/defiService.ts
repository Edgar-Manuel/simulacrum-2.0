// ============================================
// DEFI SERVICE - Uniswap/Sushiswap Integration
// Real DEX trading via smart contracts
// ============================================

import { ethers } from 'ethers';
import { Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core';
import type { SwapQuote, TokenInfo, UniswapPool, Transaction } from '../../types/trading';

// Ethereum addresses must be 0x + 40 hex chars. Fail fast if a constant gets
// corrupted (we shipped a typo'd DAI address that silently broke swaps).
function assertAddress(addr: string, label: string): string {
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
        throw new Error(`Invalid Ethereum address for ${label}: ${addr}`);
    }
    return addr;
}

// Common token addresses (Ethereum Mainnet)
const TOKENS: Record<string, TokenInfo> = {
    WETH: {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        symbol: 'WETH',
        name: 'Wrapped Ether',
        decimals: 18,
    },
    USDC: {
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
    },
    USDT: {
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        name: 'Tether USD',
        decimals: 6,
    },
    DAI: {
        address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        symbol: 'DAI',
        name: 'Dai Stablecoin',
        decimals: 18,
    },
    WBTC: {
        address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
        symbol: 'WBTC',
        name: 'Wrapped BTC',
        decimals: 8,
    },
};

// Router addresses
const ROUTERS = {
    uniswapV3: assertAddress('0xE592427A0AEce92De3Edee1F18E0157C05861564', 'UniswapV3 Router'),
    uniswapV2: assertAddress('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', 'UniswapV2 Router'),
    sushiswap: assertAddress('0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F', 'Sushiswap Router'),
};

// Validate every token address at module load
for (const [key, token] of Object.entries(TOKENS)) {
    assertAddress(token.address, key);
}

// Uniswap V3 Router ABI (simplified)
const SWAP_ROUTER_ABI = [
    'function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)',
    'function exactOutputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)',
];

// ERC20 ABI
const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
    'function symbol() external view returns (string)',
];

// Quoter V2 ABI
const QUOTER_ABI = [
    'function quoteExactInputSingle(tuple(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
];

class DeFiService {
    private provider: ethers.providers.Provider | null = null;
    private signer: ethers.Signer | null = null;
    private chainId: number = 1; // Ethereum mainnet
    private pendingTransactions: Map<string, Transaction> = new Map();

    // ==========================================
    // CONNECTION
    // ==========================================

    async connect(provider: ethers.providers.Provider, signer?: ethers.Signer): Promise<void> {
        this.provider = provider;
        this.signer = signer || null;

        const network = await provider.getNetwork();
        this.chainId = network.chainId;

        console.log(`✅ DeFi Service connected to chain ${this.chainId}`);
    }

    async connectWithWallet(walletClient: any): Promise<void> {
        // For wagmi integration
        if (walletClient) {
            const provider = new ethers.providers.Web3Provider(walletClient);
            const signer = provider.getSigner();
            await this.connect(provider, signer);
        }
    }

    isConnected(): boolean {
        return this.provider !== null;
    }

    // ==========================================
    // QUOTES
    // ==========================================

    async getSwapQuote(
        tokenInAddress: string,
        tokenOutAddress: string,
        amountIn: string,
        fee: number = 3000 // 0.3%
    ): Promise<SwapQuote | null> {
        if (!this.provider) {
            throw new Error('Provider not connected');
        }

        try {
            const quoterAddress = assertAddress(
                '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
                'Uniswap Quoter V2'
            );
            const quoter = new ethers.Contract(quoterAddress, QUOTER_ABI, this.provider);

            const tokenIn = await this.getTokenInfo(tokenInAddress);
            const tokenOut = await this.getTokenInfo(tokenOutAddress);

            if (!tokenIn || !tokenOut) {
                throw new Error('Could not fetch token info');
            }

            // Get quote
            const amountInWei = ethers.utils.parseUnits(amountIn, tokenIn.decimals);

            const [amountOut, sqrtPriceX96After, , gasEstimate] = await quoter.callStatic.quoteExactInputSingle({
                tokenIn: tokenInAddress,
                tokenOut: tokenOutAddress,
                amountIn: amountInWei,
                fee,
                sqrtPriceLimitX96: 0,
            });

            const amountOutFormatted = ethers.utils.formatUnits(amountOut, tokenOut.decimals);
            const executionPrice = parseFloat(amountOutFormatted) / parseFloat(amountIn);

            // Calculate price impact (simplified)
            const priceImpact = this.estimatePriceImpact(parseFloat(amountIn), executionPrice);

            // Calculate minimum received with slippage
            const slippageTolerance = 0.5; // 0.5%
            const minimumReceived = parseFloat(amountOutFormatted) * (1 - slippageTolerance / 100);

            return {
                tokenIn,
                tokenOut,
                amountIn,
                amountOut: amountOutFormatted,
                priceImpact,
                route: [tokenIn.symbol, tokenOut.symbol],
                gasEstimate: gasEstimate.toString(),
                executionPrice,
                minimumReceived: minimumReceived.toString(),
                fee: fee / 10000, // Convert to percentage
            };
        } catch (error: any) {
            console.error('Error getting swap quote:', error.message);
            return null;
        }
    }

    private estimatePriceImpact(amountIn: number, executionPrice: number): number {
        // Simplified price impact estimation
        // In production, you'd compare against the pool's current price
        if (amountIn < 1000) return 0.1;
        if (amountIn < 10000) return 0.3;
        if (amountIn < 100000) return 0.8;
        return 1.5;
    }

    // ==========================================
    // SWAPS
    // ==========================================

    async executeSwap(
        tokenInAddress: string,
        tokenOutAddress: string,
        amountIn: string,
        minAmountOut: string,
        fee: number = 3000,
        deadline?: number
    ): Promise<Transaction | null> {
        if (!this.signer) {
            throw new Error('Signer not connected');
        }

        try {
            const tokenIn = await this.getTokenInfo(tokenInAddress);
            const tokenOut = await this.getTokenInfo(tokenOutAddress);

            if (!tokenIn || !tokenOut) {
                throw new Error('Could not fetch token info');
            }

            const signerAddress = await this.signer.getAddress();
            const amountInWei = ethers.utils.parseUnits(amountIn, tokenIn.decimals);
            const minAmountOutWei = ethers.utils.parseUnits(minAmountOut, tokenOut.decimals);
            const deadlineTimestamp = deadline || Math.floor(Date.now() / 1000) + 1800; // 30 minutes

            // Approve token spending if needed
            await this.ensureApproval(tokenInAddress, ROUTERS.uniswapV3, amountInWei);

            // Create swap transaction
            const router = new ethers.Contract(ROUTERS.uniswapV3, SWAP_ROUTER_ABI, this.signer);

            const params = {
                tokenIn: tokenInAddress,
                tokenOut: tokenOutAddress,
                fee,
                recipient: signerAddress,
                deadline: deadlineTimestamp,
                amountIn: amountInWei,
                amountOutMinimum: minAmountOutWei,
                sqrtPriceLimitX96: 0,
            };

            console.log(`🔄 Executing swap: ${amountIn} ${tokenIn.symbol} → ${tokenOut.symbol}`);

            const tx = await router.exactInputSingle(params);

            const transaction: Transaction = {
                id: `swap_${Date.now()}`,
                hash: tx.hash,
                type: 'swap',
                status: 'pending',
                from: signerAddress,
                to: ROUTERS.uniswapV3,
                value: amountIn,
                timestamp: Date.now(),
                metadata: {
                    tokenIn: tokenIn.symbol,
                    tokenOut: tokenOut.symbol,
                    amountIn,
                    minAmountOut,
                },
            };

            this.pendingTransactions.set(tx.hash, transaction);

            // Wait for confirmation and update status
            this.waitForConfirmation(tx);

            return transaction;
        } catch (error: any) {
            console.error('❌ Swap failed:', error.message);
            throw error;
        }
    }

    private async ensureApproval(
        tokenAddress: string,
        spenderAddress: string,
        amount: ethers.BigNumber
    ): Promise<void> {
        if (!this.signer) return;

        const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
        const signerAddress = await this.signer.getAddress();

        const currentAllowance = await token.allowance(signerAddress, spenderAddress);

        if (currentAllowance.lt(amount)) {
            console.log('📝 Approving token spending...');
            const approveTx = await token.approve(spenderAddress, ethers.constants.MaxUint256);
            await approveTx.wait();
            console.log('✅ Token approved');
        }
    }

    private async waitForConfirmation(tx: ethers.ContractTransaction): Promise<void> {
        try {
            const receipt = await tx.wait();

            const transaction = this.pendingTransactions.get(tx.hash);
            if (transaction) {
                transaction.status = receipt.status === 1 ? 'confirmed' : 'failed';
                transaction.gasUsed = receipt.gasUsed.toString();
                transaction.blockNumber = receipt.blockNumber;
                console.log(`✅ Transaction confirmed: ${tx.hash}`);
            }
        } catch (error) {
            const transaction = this.pendingTransactions.get(tx.hash);
            if (transaction) {
                transaction.status = 'failed';
            }
            console.error(`❌ Transaction failed: ${tx.hash}`);
        }
    }

    // ==========================================
    // TOKEN INFO
    // ==========================================

    async getTokenInfo(address: string): Promise<TokenInfo | null> {
        // Check cache first
        for (const token of Object.values(TOKENS)) {
            if (token.address.toLowerCase() === address.toLowerCase()) {
                return token;
            }
        }

        if (!this.provider) return null;

        try {
            const token = new ethers.Contract(address, ERC20_ABI, this.provider);
            const [symbol, decimals] = await Promise.all([
                token.symbol(),
                token.decimals(),
            ]);

            return {
                address,
                symbol,
                name: symbol, // Would need another call for name
                decimals,
            };
        } catch (error) {
            console.error('Error fetching token info:', error);
            return null;
        }
    }

    async getTokenBalance(tokenAddress: string, walletAddress: string): Promise<string> {
        if (!this.provider) return '0';

        try {
            if (tokenAddress === 'ETH' || tokenAddress === ethers.constants.AddressZero) {
                const balance = await this.provider.getBalance(walletAddress);
                return ethers.utils.formatEther(balance);
            }

            const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
            const [balance, decimals] = await Promise.all([
                token.balanceOf(walletAddress),
                token.decimals(),
            ]);

            return ethers.utils.formatUnits(balance, decimals);
        } catch (error) {
            console.error('Error fetching token balance:', error);
            return '0';
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    getKnownTokens(): TokenInfo[] {
        return Object.values(TOKENS);
    }

    getTransaction(hash: string): Transaction | undefined {
        return this.pendingTransactions.get(hash);
    }

    getPendingTransactions(): Transaction[] {
        return Array.from(this.pendingTransactions.values()).filter(t => t.status === 'pending');
    }

    // ==========================================
    // SUSHISWAP INTEGRATION
    // ==========================================

    async getSushiswapQuote(
        tokenInAddress: string,
        tokenOutAddress: string,
        amountIn: string
    ): Promise<SwapQuote | null> {
        // Similar to Uniswap but using Sushiswap router
        // Sushiswap V2 uses different mechanism
        if (!this.provider) return null;

        try {
            const tokenIn = await this.getTokenInfo(tokenInAddress);
            const tokenOut = await this.getTokenInfo(tokenOutAddress);

            if (!tokenIn || !tokenOut) return null;

            // Sushiswap uses V2 style - would need to call getAmountsOut
            // Simplified implementation
            const sushiRouter = new ethers.Contract(
                ROUTERS.sushiswap,
                ['function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'],
                this.provider
            );

            const amountInWei = ethers.utils.parseUnits(amountIn, tokenIn.decimals);
            const path = [tokenInAddress, tokenOutAddress];

            const amounts = await sushiRouter.getAmountsOut(amountInWei, path);
            const amountOut = ethers.utils.formatUnits(amounts[1], tokenOut.decimals);

            return {
                tokenIn,
                tokenOut,
                amountIn,
                amountOut,
                priceImpact: this.estimatePriceImpact(parseFloat(amountIn), parseFloat(amountOut) / parseFloat(amountIn)),
                route: [tokenIn.symbol, tokenOut.symbol],
                gasEstimate: '150000',
                executionPrice: parseFloat(amountOut) / parseFloat(amountIn),
                minimumReceived: (parseFloat(amountOut) * 0.995).toString(),
                fee: 0.3,
            };
        } catch (error) {
            console.error('Error getting Sushiswap quote:', error);
            return null;
        }
    }

    // Compare quotes across DEXs
    async getBestQuote(
        tokenInAddress: string,
        tokenOutAddress: string,
        amountIn: string
    ): Promise<{ dex: string; quote: SwapQuote } | null> {
        const [uniQuote, sushiQuote] = await Promise.all([
            this.getSwapQuote(tokenInAddress, tokenOutAddress, amountIn),
            this.getSushiswapQuote(tokenInAddress, tokenOutAddress, amountIn),
        ]);

        if (!uniQuote && !sushiQuote) return null;
        if (!uniQuote) return { dex: 'sushiswap', quote: sushiQuote! };
        if (!sushiQuote) return { dex: 'uniswap', quote: uniQuote };

        // Compare and return best
        const uniOut = parseFloat(uniQuote.amountOut);
        const sushiOut = parseFloat(sushiQuote.amountOut);

        if (uniOut >= sushiOut) {
            return { dex: 'uniswap', quote: uniQuote };
        } else {
            return { dex: 'sushiswap', quote: sushiQuote };
        }
    }
}

export const defiService = new DeFiService();
export default defiService;
