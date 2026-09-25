/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
import type { InfiniteData } from '@tanstack/react-query';

import type { FragmentType } from './types';

/**
 * `useFragment` (from codegen) for data that TanStack Query wrapped in
 * `InfiniteData`. Like its counterpart it is a compile-time cast — masked
 * fragment refs and the real fragment shape are the same object at runtime —
 * so there is no hook call here despite the name.
 */
// return non-nullable if `fragmentType` is non-nullable
export function useInfiniteFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType: InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>,
): InfiniteData<TType>;
// return nullable if `fragmentType` is undefined
export function useInfiniteFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType:
    | InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>
    | undefined,
): InfiniteData<TType | undefined>;
// return nullable if `fragmentType` is nullable
export function useInfiniteFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType: InfiniteData<
    FragmentType<DocumentTypeDecoration<TType, any>>
  > | null,
): InfiniteData<TType | null>;
// return nullable if `fragmentType` is nullable or undefined
export function useInfiniteFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType:
    | InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>
    | null
    | undefined,
): InfiniteData<TType | null | undefined>;
// return array of non-nullable if `fragmentType` is array of non-nullable
export function useInfiniteFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType: Array<
    InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>
  >,
): InfiniteData<Array<TType>>;
// return array of nullable if `fragmentType` is array of nullable
export function useInfiniteFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType:
    | Array<InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>>
    | null
    | undefined,
): InfiniteData<Array<TType> | null | undefined>;
// return readonly array of non-nullable if `fragmentType` is array of non-nullable
export function useInfiniteFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType: ReadonlyArray<
    InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>
  >,
): InfiniteData<ReadonlyArray<TType>>;
// return readonly array of nullable if `fragmentType` is array of nullable
export function useInfiniteFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType:
    | ReadonlyArray<
        InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>
      >
    | null
    | undefined,
): InfiniteData<ReadonlyArray<TType> | null | undefined>;

export function useInfiniteFragment<TType>(
  _documentNode: DocumentTypeDecoration<TType, any>,
  fragmentType:
    | InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>
    | Array<InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>>
    | ReadonlyArray<
        InfiniteData<FragmentType<DocumentTypeDecoration<TType, any>>>
      >
    | null
    | undefined,
): InfiniteData<
  TType | Array<TType> | ReadonlyArray<TType> | null | undefined
> {
  return fragmentType as any;
}
