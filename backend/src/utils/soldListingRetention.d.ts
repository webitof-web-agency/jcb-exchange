export declare const SOLD_LISTING_RETENTION_DAYS = 30;
export declare const SOLD_LISTING_CLEANUP_INTERVAL_MS: number;
export declare const getSoldListingCutoff: (now?: Date) => Date;
type ListingSnapshot = {
    id: string;
    title?: string | null;
    status?: string | null;
    price?: number | {
        toString(): string;
    } | null;
    locationCity?: string | null;
    locationState?: string | null;
};
export declare const getSoldAtValueForStatus: ({ nextStatus, previousStatus, previousSoldAt, now, }: {
    nextStatus: string;
    previousStatus?: string | null;
    previousSoldAt?: Date | null;
    now?: Date;
}) => Date | null;
export declare const cleanupExpiredSoldListings: (now?: Date) => Promise<{
    deletedListingCount: number;
    detachedLeadCount: number;
    deletedMediaCount: any;
    deletedFileCount: number;
    listingIds: any;
}>;
export declare const setListingSoldAt: (listingId: string, soldAt: Date | null) => Promise<void>;
export declare const detachLeadsFromListing: (tx: any, listing: ListingSnapshot) => Promise<number>;
export declare const startSoldListingRetentionJob: () => void;
export {};
//# sourceMappingURL=soldListingRetention.d.ts.map