/* Firestore-shaped read adapter for the public, sanitized callable catalog. */
window.createPublicCatalogQuery = function createPublicCatalogQuery(call, collection, initial = {}) {
    const state = {collection, filters: [], orders: [], ...initial};
    const next = patch => window.createPublicCatalogQuery(call, collection, {...state, ...patch});
    return {
        where: (field, operator, value) => next({filters: [...state.filters, [field, operator, value]]}),
        orderBy: (field, direction = 'asc') => next({orders: [...state.orders, [field, direction]]}),
        limit: limit => next({limit}),
        doc: id => next({id}),
        collection: name => {
            if (collection !== 'tumbas' || name !== 'photos' || !state.id) throw new Error('Catálogo no válido.');
            return window.createPublicCatalogQuery(call, 'photos', {tombId: state.id});
        },
        async get() {
            const docs = [];
            let after;
            const requested = state.limit || Infinity;
            do {
                const response = await call({...state, limit: Math.min(100, requested - docs.length), ...(after ? {after} : {})});
                for (const item of response.data.docs) {
                    for (const field of ['timestamp', 'createdAt']) {
                        const value = item.data[field];
                        if (value && Number.isFinite(value.seconds)) value.toMillis = () => value.seconds * 1000;
                    }
                    docs.push({id: item.id, exists: true, data: () => item.data});
                }
                if (!response.data.more || state.id || docs.length >= requested || !response.data.after || response.data.after === after) break;
                after = response.data.after;
            } while (true);
            if (state.id) return docs[0] || {id: state.id, exists: false};
            return {docs, size: docs.length, empty: !docs.length, forEach: callback => docs.forEach(callback)};
        }
    };
};
