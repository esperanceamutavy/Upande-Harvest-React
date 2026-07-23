import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api';

// Frappe REST: GET /api/resource/UOM?filters=[["name","like","%Bunch%"]]&fields=["name"]&limit_page_length=20
interface UomDoc { name: string }

async function fetchBunchUoms(): Promise<string[]> {
  const res = await apiClient.get<{ data: UomDoc[] }>('/api/resource/UOM', {
    params: {
      filters: JSON.stringify([['name', 'like', '%Bunch%']]),
      fields: JSON.stringify(['name']),
      limit_page_length: 20,
    },
  });
  return (res.data?.data || []).map((d) => d.name).sort();
}

// Hardcoded fallback used when fetch fails or returns empty.
const FALLBACK: string[] = ['Bunch(5)', 'Bunch(9)', 'Bunch(10)', 'Bunch(15)'];

export function useBunchSizeOptions(): string[] {
  const q = useQuery({
    queryKey: ['bunch-uoms'],
    queryFn: fetchBunchUoms,
    staleTime: 1000 * 60 * 60 * 24, // 24h
  });
  if (q.data && q.data.length > 0) return q.data;
  return FALLBACK;
}
