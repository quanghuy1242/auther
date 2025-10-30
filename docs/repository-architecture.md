# Repository Architecture Diagram

## Before (Tight Coupling)

```
┌─────────────────────────────────────────────────┐
│           Server Actions Layer                  │
│  ┌──────────────┬──────────────┬──────────────┐ │
│  │ users/       │ clients/     │ keys/        │ │
│  │ actions.ts   │ actions.ts   │ actions.ts   │ │
│  │              │              │              │ │
│  │ Direct DB    │ Direct DB    │ Direct DB    │ │
│  │ Queries ❌   │ Queries ❌   │ Queries ❌   │ │
│  └──────┬───────┴──────┬───────┴──────┬───────┘ │
│         │              │              │         │
└─────────┼──────────────┼──────────────┼─────────┘
          │              │              │
          └──────────────┼──────────────┘
                         │
                    ┌────▼────┐
                    │ Drizzle │
                    │   ORM   │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │ SQLite  │
                    │   DB    │
                    └─────────┘

Problems:
❌ Duplicate queries across action files
❌ Hard to test (DB dependency)
❌ Schema changes affect many files
❌ No single source of truth
```

## After (Repository Pattern)

```
┌──────────────────────────────────────────────────────────┐
│                  Presentation Layer                      │
│  ┌────────────┬────────────┬────────────┬─────────────┐ │
│  │  Admin     │  Sessions  │   Users    │   Clients   │ │
│  │ Dashboard  │   Page     │   Page     │    Page     │ │
│  └─────┬──────┴─────┬──────┴─────┬──────┴──────┬──────┘ │
└────────┼────────────┼────────────┼─────────────┼────────┘
         │            │            │             │
         │            │            │             │
┌────────▼────────────▼────────────▼─────────────▼────────┐
│              Business Logic Layer (Actions)              │
│  ┌────────────┬────────────┬────────────┬─────────────┐ │
│  │   admin/   │  sessions/ │   users/   │  clients/   │ │
│  │ actions.ts │ actions.ts │ actions.ts │ actions.ts  │ │
│  │            │            │            │             │ │
│  │ ✅ Clean   │ ✅ Clean   │ ✅ Clean   │ ✅ Clean    │ │
│  │ Business   │ Business   │ Business   │ Business    │ │
│  │ Logic      │ Logic      │ Logic      │ Logic       │ │
│  └─────┬──────┴─────┬──────┴─────┬──────┴──────┬──────┘ │
└────────┼────────────┼────────────┼─────────────┼────────┘
         │            │            │             │
         │            │            │             │
┌────────▼────────────▼────────────▼─────────────▼────────┐
│           Data Access Layer (Repositories) ✅            │
│  ┌────────────┬────────────┬────────────┬─────────────┐ │
│  │   User     │  Session   │  Account   │OAuth Client │ │
│  │ Repository │ Repository │ Repository │ Repository  │ │
│  │            │            │            │             │ │
│  │ findById   │ findMany   │ findById   │ findMany    │ │
│  │ findMany   │ countActive│ delete     │ getStats    │ │
│  │ getStats   │ delete     │            │             │ │
│  │ update     │ findRecent │            │             │ │
│  └─────┬──────┴─────┬──────┴─────┬──────┴──────┬──────┘ │
│        │            │            │             │        │
│        └────────────┼────────────┼─────────────┘        │
└─────────────────────┼────────────┼──────────────────────┘
                      │            │
                 ┌────▼────────────▼───┐
                 │    Drizzle ORM      │
                 └──────────┬──────────┘
                            │
                       ┌────▼────┐
                       │ SQLite  │
                       │   DB    │
                       └─────────┘

Benefits:
✅ Single responsibility per repository
✅ Easy to mock for testing
✅ Centralized query logic
✅ Type-safe interfaces
✅ Reusable across actions
```

## Data Flow Example: Dashboard Statistics

```
1. User visits /admin
   │
   ▼
2. Dashboard Page Component
   │
   ▼
3. getDashboardStats() action
   │
   ├─── getUserStats()
   │    └─── userRepository.getStats()
   │         └─── SELECT COUNT(*) FROM user ...
   │
   ├─── getClientStats()
   │    └─── oauthClientRepository.getStats()
   │         └─── SELECT COUNT(*) FROM oauth_application ...
   │
   ├─── sessionRepository.countActive()
   │    └─── SELECT COUNT(*) FROM session WHERE ...
   │
   └─── getJwksKeys()
        └─── jwksRepository.findAllWithStatus()
             └─── SELECT * FROM jwks ...
   │
   ▼
4. Aggregate results in parallel
   │
   ▼
5. Return dashboard data
   │
   ▼
6. Render UI with stats
```

## Repository Method Reuse

```
┌──────────────────────────────────────────────┐
│       sessionRepository.findRecent()         │
│                                              │
│  Used by:                                    │
│  ✓ Dashboard (recent sign-ins)              │
│  ✓ User detail page (user sessions)         │
│  ✓ Session list page (latest activity)      │
│                                              │
│  Benefits:                                   │
│  • Query written once, used 3 times         │
│  • Update in one place affects all          │
│  • Consistent data format across app        │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│       userRepository.getStats()              │
│                                              │
│  Used by:                                    │
│  ✓ Dashboard (user statistics card)         │
│  ✓ Admin reports (future)                   │
│  ✓ Analytics endpoints (future)             │
│                                              │
│  Benefits:                                   │
│  • Statistics logic centralized             │
│  • Easy to add new metrics                  │
│  • Consistent calculation across features   │
└──────────────────────────────────────────────┘
```

## Testing Strategy

```
Unit Tests (With Mocked Repositories)
┌──────────────────────────────────────┐
│  describe('getDashboardStats')       │
│                                      │
│  const mockUserRepo = {              │
│    getStats: () => ({ total: 10 })  │
│  }                                   │
│                                      │
│  const mockSessionRepo = {           │
│    countActive: () => 5              │
│  }                                   │
│                                      │
│  // Test without real database ✅   │
└──────────────────────────────────────┘

Integration Tests (With Real Repositories)
┌──────────────────────────────────────┐
│  describe('UserRepository')          │
│                                      │
│  beforeEach(async () => {            │
│    await setupTestDatabase()         │
│  })                                  │
│                                      │
│  it('finds user by id', async () => │
│    const user = await repo.findById()│
│    expect(user).toBeDefined()        │
│  })                                  │
│                                      │
│  // Test with test database ✅      │
└──────────────────────────────────────┘
```

## Security Model

```
┌────────────────────────────────────────┐
│         Session Data Security          │
│                                        │
│  Standard Query (No Token):            │
│  ┌──────────────────────────────────┐ │
│  │ sessionRepository.findByUserId() │ │
│  │ → Returns SessionEntity          │ │
│  │ → No token field ✅              │ │
│  └──────────────────────────────────┘ │
│                                        │
│  Revocation Query (With Token):        │
│  ┌──────────────────────────────────┐ │
│  │ sessionRepository.               │ │
│  │   findByUserIdWithToken()        │ │
│  │ → Returns SessionWithToken       │ │
│  │ → Includes token field ⚠️        │ │
│  │ → Only for revocation            │ │
│  └──────────────────────────────────┘ │
│                                        │
│  Principle: Minimal Data Exposure      │
└────────────────────────────────────────┘
```

## Performance Optimization

```
┌────────────────────────────────────────┐
│      Parallel Data Fetching            │
│                                        │
│  Before (Sequential):                  │
│  ┌──────────────────────────────────┐ │
│  │ await getUserStats()      (100ms)│ │
│  │ await getClientStats()    (100ms)│ │
│  │ await countActive()       (100ms)│ │
│  │ await getKeys()           (100ms)│ │
│  │ ────────────────────────────────│ │
│  │ Total: 400ms ❌                  │ │
│  └──────────────────────────────────┘ │
│                                        │
│  After (Parallel):                     │
│  ┌──────────────────────────────────┐ │
│  │ Promise.all([                    │ │
│  │   getUserStats(),                │ │
│  │   getClientStats(),       All run│ │
│  │   countActive(),        in parallel│
│  │   getKeys()                      │ │
│  │ ])                               │ │
│  │ ────────────────────────────────│ │
│  │ Total: 100ms ✅ (4x faster)     │ │
│  └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

## Migration Path

```
Phase 1: Repository Creation ✅
├─ Create base repository interface
├─ Implement UserRepository
├─ Implement SessionRepository
├─ Implement AccountRepository
├─ Implement OAuthClientRepository
└─ Implement JwksRepository

Phase 2: Action Migration ✅
├─ Refactor users/actions.ts
├─ Refactor clients/actions.ts
├─ Refactor keys/actions.ts
├─ Refactor admin/actions.ts
└─ Refactor users/[id]/actions.ts

Phase 3: Validation ✅
├─ Build project (19 routes compiled)
├─ Run lint (0 errors, 0 warnings)
└─ Test functionality (all features working)

Phase 4: Documentation ✅
├─ Create implementation guide
└─ Create architecture diagrams

Phase 5: Future Enhancements
├─ Add unit tests with mocked repos
├─ Add integration tests
├─ Implement caching layer
├─ Add transaction support
└─ Monitor performance metrics
```
