/**
 * API Client con TanStack Query
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Fixture, Prediction, PredictionsFilters } from '@/types';
import { ENV } from '@/config/env';

const API_BASE_URL = ENV.API_URL;

// ============================================
// FETCH FUNCTIONS
// ============================================

async function fetchFixtures(params: {
  date?: string;
  days?: number;
  leagueId?: number;
  teamId?: number;
  season?: number;
}): Promise<Fixture[]> {
  const queryParams = new URLSearchParams();
  if (params.date) queryParams.append('date', params.date);
  if (params.days !== undefined) queryParams.append('days', params.days.toString());
  if (params.leagueId) queryParams.append('leagueId', params.leagueId.toString());
  if (params.teamId) queryParams.append('teamId', params.teamId.toString());
  if (params.season) queryParams.append('season', params.season.toString());
  
  const url = `${API_BASE_URL}/api/fixtures?${queryParams.toString()}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch fixtures: ${response.statusText}`);
  }
  
  return response.json();
}

async function fetchPredictions(filters: PredictionsFilters): Promise<Prediction[]> {
  const queryParams = new URLSearchParams();
  if (filters.date) queryParams.append('date', filters.date);
  if (filters.days !== undefined) queryParams.append('days', filters.days.toString());
  if (filters.leagueId) queryParams.append('leagueId', filters.leagueId.toString());
  if (filters.minConfidence !== undefined) queryParams.append('minConfidence', filters.minConfidence.toString());
  if (filters.strengthFilter) queryParams.append('strengthFilter', filters.strengthFilter);
  
  const url = `${API_BASE_URL}/api/predictions?${queryParams.toString()}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch predictions: ${response.statusText}`);
  }
  
  return response.json();
}

async function fetchPrediction(fixtureId: number): Promise<Prediction> {
  const url = `${API_BASE_URL}/api/predictions/${fixtureId}`;
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch prediction: ${response.statusText}`);
  }
  
  return response.json();
}

async function calculatePrediction(input: {
  fixtureId: number;
  homeTeamId: number;
  awayTeamId: number;
  season: number;
  leagueId: number;
}): Promise<Prediction> {
  const url = `${API_BASE_URL}/api/predictions/calculate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to calculate prediction');
  }
  
  return response.json();
}

// ============================================
// REACT QUERY HOOKS
// ============================================

export function useFixtures(params: {
  date?: string;
  days?: number;
  leagueId?: number;
  teamId?: number;
  season?: number;
}) {
  return useQuery({
    queryKey: ['fixtures', params],
    queryFn: () => fetchFixtures(params),
    staleTime: 5 * 60 * 1000, // 5 minuti
    refetchInterval: 5 * 60 * 1000, // Auto-refresh ogni 5 minuti
  });
}

export function usePredictions(filters: PredictionsFilters) {
  return useQuery({
    queryKey: ['predictions', filters],
    queryFn: () => fetchPredictions(filters),
    staleTime: 2 * 60 * 1000, // 2 minuti
    refetchInterval: 2 * 60 * 1000, // Auto-refresh ogni 2 minuti
  });
}

export function usePrediction(fixtureId: number | null) {
  return useQuery({
    queryKey: ['prediction', fixtureId],
    queryFn: () => fetchPrediction(fixtureId!),
    enabled: fixtureId !== null,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCalculatePrediction() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: calculatePrediction,
    onSuccess: (data) => {
      // Invalida cache predictions
      queryClient.invalidateQueries({ queryKey: ['predictions'] });
      queryClient.invalidateQueries({ queryKey: ['prediction', data.fixtureId] });
    },
  });
}
