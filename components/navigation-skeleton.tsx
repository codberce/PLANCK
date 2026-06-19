"use client"

export function NavigationSkeleton() {
    return (
        <>
            <nav className="fixed top-0 left-0 right-0 z-[300] border-b border-gray-200 bg-[#ffffff]">
                <div className="w-full px-4 sm:px-6 lg:px-8">
                    <div className="relative flex h-16 items-center justify-between gap-4">
                        <div className="burger:hidden flex w-full items-center justify-between">
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pr-2">
                                <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
                                <div className="h-3 w-40 animate-pulse rounded bg-gray-100" />
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <div className="h-4 w-10 animate-pulse rounded bg-gray-200" />
                                <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
                            </div>
                        </div>

                        <div className="hidden burger:flex flex-1 items-center gap-6">
                            <div className="flex items-center gap-2">
                                <div className="h-6 w-6 animate-pulse rounded bg-[#1a1a1a]" />
                                <div className="hidden h-6 w-20 animate-pulse rounded bg-[#1a1a1a] logo:block" />
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="h-4 w-16 animate-pulse rounded bg-[#1a1a1a]" />
                                <div className="h-4 w-20 animate-pulse rounded bg-[#1a1a1a]" />
                                <div className="h-4 w-14 animate-pulse rounded bg-[#1a1a1a]" />
                                <div className="h-4 w-24 animate-pulse rounded bg-[#1a1a1a]" />
                            </div>
                        </div>

                        <div className="hidden burger:flex items-center gap-3">
                            <div className="h-4 w-10 animate-pulse rounded bg-[#1a1a1a]" />
                            <div className="h-4 w-16 animate-pulse rounded bg-[#1a1a1a]" />
                            <div className="h-9 w-[180px] animate-pulse rounded-full bg-[#1a1a1a]" />
                            <div className="h-9 w-9 animate-pulse rounded bg-[#1a1a1a]" />
                        </div>
                    </div>
                </div>
            </nav>
            <div className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-[300] bg-white pb-[env(safe-area-inset-bottom,0px)] burger:hidden">
                <div className="flex h-[4.5rem] items-center justify-around px-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div key={index} className="flex flex-col items-center gap-1">
                            <div className="h-5 w-5 animate-pulse rounded bg-gray-200" />
                            <div className="h-2.5 w-10 animate-pulse rounded bg-gray-100" />
                        </div>
                    ))}
                </div>
            </div>
        </>
    )
}
