import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { POSTGRES_POOL, PostgresPool } from './postgres.constants';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: PostgresPool,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Test the connection on startup
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as current_time, version()');
      client.release();
      console.log('✅ PostgreSQL connected successfully');
      console.log(`   Database time: ${result.rows[0].current_time}`);
      console.log(`   Version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
    console.log('🔌 PostgreSQL pool closed');
  }

  /**
   * Execute a query with automatic client release
   */
  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      if (this.configService.get('NODE_ENV') === 'development') {
        console.log(`📝 Query executed in ${duration}ms: ${text.substring(0, 100)}...`);
      }
      return result;
    } catch (error) {
      console.error('❌ Query error:', error.message);
      console.error('   Query:', text);
      console.error('   Params:', params);
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  /**
   * Execute a transaction with automatic commit/rollback
   */
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check database connectivity
   */
  async healthCheck(): Promise<{ status: 'up' | 'down'; latency?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return { status: 'up', latency: Date.now() - start };
    } catch (error) {
      return { status: 'down', error: error.message, latency: Date.now() - start };
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): { totalCount: number; idleCount: number; waitingCount: number } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}