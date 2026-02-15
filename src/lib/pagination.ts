interface PaginationParams {
  page: number;
  limit: number;
}

interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function parsePagination(
  url: URL,
  defaultLimit = 20,
): PaginationParams | null {
  const pageStr = url.searchParams.get("page");
  const limitStr = url.searchParams.get("limit");

  // Only paginate if at least one pagination param is present
  if (!pageStr && !limitStr) return null;

  const page = Math.max(1, parseInt(pageStr || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(limitStr || String(defaultLimit), 10) || defaultLimit));

  return { page, limit };
}

export function paginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
) {
  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages: Math.ceil(total / params.limit),
    } satisfies PaginatedMeta,
  };
}
