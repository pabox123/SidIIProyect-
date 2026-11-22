import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Connection } from 'mongoose';
import { InjectConnection } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MongodbService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Mongoose connection events
    this.connection.on('connected', () => {
      console.log('✅ MongoDB connected successfully');
      console.log(`   Database: ${this.connection.name}`);
      console.log(`   Host: ${this.connection.host}:${this.connection.port}`);
    });

    this.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error.message);
    });

    this.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    // Wait for initial connection
    if (this.connection.readyState !== 1) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('MongoDB connection timeout')), 10000);
        this.connection.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });
        this.connection.once('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
    }
  }

  async onModuleDestroy() {
    await this.connection.close();
    console.log('🔌 MongoDB connection closed');
  }

  /**
   * Get the Mongoose connection instance
   */
  getConnection(): Connection {
    return this.connection;
  }

  /**
   * Get a specific collection
   */
  getCollection(name: string) {
    return this.connection.collection(name);
  }

  /**
   * Check database connectivity
   */
  async healthCheck(): Promise<{ status: 'up' | 'down'; latency?: number; error?: string; collections?: number }> {
    const start = Date.now();
    try {
      // Ping the database
      await this.connection.db!.admin().ping();
      const collections = await this.connection.db!.listCollections().toArray();
      return {
        status: 'up',
        latency: Date.now() - start,
        collections: collections.length,
      };
    } catch (error) {
      return { status: 'down', error: error.message, latency: Date.now() - start };
    }
  }

  /**
   * Get connection state
   */
  getConnectionState(): string {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return states[this.connection.readyState] || 'unknown';
  }

  /**
   * Get database stats
   */
  async getDbStats(): Promise<any> {
    return this.connection.db!.stats();
  }
}