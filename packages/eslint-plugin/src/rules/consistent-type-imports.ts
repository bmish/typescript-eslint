import {
  TSESLint,
  TSESTree,
  AST_TOKEN_TYPES,
  AST_NODE_TYPES,
} from '@typescript-eslint/experimental-utils';
import * as util from '../util';

type Prefer = 'type-imports' | 'no-type-imports';

type Options = [
  {
    prefer?: Prefer;
    disallowTypeAnnotations?: boolean;
  },
];

interface SourceImports {
  source: string;
  reportValueImports: ReportValueImport[];
  // ImportDeclaration for type-only import only with named imports.
  typeOnlyNamedImport: TSESTree.ImportDeclaration | null;
  // ImportDeclaration for value-only import only with named imports.
  valueOnlyNamedImport: TSESTree.ImportDeclaration | null;
}
interface ReportValueImport {
  node: TSESTree.ImportDeclaration;
  typeSpecifiers: TSESTree.ImportClause[]; // It has at least one element.
  valueSpecifiers: TSESTree.ImportClause[];
  unusedSpecifiers: TSESTree.ImportClause[];
  inlineTypeSpecifiers: TSESTree.ImportSpecifier[];
}

function isImportToken(
  token: TSESTree.Token,
): token is TSESTree.KeywordToken & { value: 'import' } {
  return token.type === AST_TOKEN_TYPES.Keyword && token.value === 'import';
}

function isTypeToken(
  token: TSESTree.Token,
): token is TSESTree.IdentifierToken & { value: 'type' } {
  return token.type === AST_TOKEN_TYPES.Identifier && token.value === 'type';
}

type MessageIds =
  | 'typeOverValue'
  | 'someImportsAreOnlyTypes'
  | 'aImportIsOnlyTypes'
  | 'valueOverType'
  | 'noImportTypeAnnotations'
  | 'someImportsInDecoMeta'
  | 'aImportInDecoMeta';
export default util.createRule<Options, MessageIds>({
  name: 'consistent-type-imports',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforces consistent usage of type imports',
      recommended: false,
    },
    messages: {
      typeOverValue:
        'All imports in the declaration are only used as types. Use `import type`.',
      someImportsAreOnlyTypes:
        'Imports {{typeImports}} are only used as types.',
      aImportIsOnlyTypes: 'Import {{typeImports}} is only used as types.',
      someImportsInDecoMeta:
        'Type imports {{typeImports}} are used by decorator metadata.',
      aImportInDecoMeta:
        'Type import {{typeImports}} is used by decorator metadata.',
      valueOverType: 'Use an `import` instead of an `import type`.',
      noImportTypeAnnotations: '`import()` type annotations are forbidden.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          prefer: {
            enum: ['type-imports', 'no-type-imports'],
          },
          disallowTypeAnnotations: {
            type: 'boolean',
          },
        },
        additionalProperties: false,
      },
    ],
    fixable: 'code',
  },

  defaultOptions: [
    {
      prefer: 'type-imports',
      disallowTypeAnnotations: true,
    },
  ],

  create(context, [option]) {
    const prefer = option.prefer ?? 'type-imports';
    const disallowTypeAnnotations = option.disallowTypeAnnotations !== false;
    const sourceCode = context.getSourceCode();

    const sourceImportsMap: { [key: string]: SourceImports } = {};

    return {
      ...(prefer === 'type-imports'
        ? {
            // prefer type imports
            ImportDeclaration(node): void {
              const source = node.source.value;
              const sourceImports =
                sourceImportsMap[source] ??
                (sourceImportsMap[source] = {
                  source,
                  reportValueImports: [],
                  typeOnlyNamedImport: null,
                  valueOnlyNamedImport: null,
                });
              if (node.importKind === 'type') {
                if (
                  !sourceImports.typeOnlyNamedImport &&
                  node.specifiers.every(
                    specifier =>
                      specifier.type === AST_NODE_TYPES.ImportSpecifier,
                  )
                ) {
                  sourceImports.typeOnlyNamedImport = node;
                }
              } else {
                if (
                  !sourceImports.valueOnlyNamedImport &&
                  node.specifiers.every(
                    specifier =>
                      specifier.type === AST_NODE_TYPES.ImportSpecifier,
                  )
                ) {
                  sourceImports.valueOnlyNamedImport = node;
                }
              }

              const typeSpecifiers: TSESTree.ImportClause[] = [];
              const inlineTypeSpecifiers: TSESTree.ImportSpecifier[] = [];
              const valueSpecifiers: TSESTree.ImportClause[] = [];
              const unusedSpecifiers: TSESTree.ImportClause[] = [];
              for (const specifier of node.specifiers) {
                if (
                  specifier.type === AST_NODE_TYPES.ImportSpecifier &&
                  specifier.importKind === 'type'
                ) {
                  inlineTypeSpecifiers.push(specifier);
                  continue;
                }

                const [variable] = context.getDeclaredVariables(specifier);
                if (variable.references.length === 0) {
                  unusedSpecifiers.push(specifier);
                } else {
                  const onlyHasTypeReferences = variable.references.every(
                    ref => {
                      /**
                       * keep origin import kind when export
                       * export { Type }
                       * export default Type;
                       */
                      if (
                        ref.identifier.parent?.type ===
                          AST_NODE_TYPES.ExportSpecifier ||
                        ref.identifier.parent?.type ===
                          AST_NODE_TYPES.ExportDefaultDeclaration
                      ) {
                        if (ref.isValueReference && ref.isTypeReference) {
                          return node.importKind === 'type';
                        }
                      }
                      if (ref.isValueReference) {
                        let parent: TSESTree.Node | undefined =
                          ref.identifier.parent;
                        let child: TSESTree.Node = ref.identifier;
                        while (parent) {
                          switch (parent.type) {
                            // CASE 1:
                            // `type T = typeof foo` will create a value reference because "foo" must be a value type
                            // however this value reference is safe to use with type-only imports
                            case AST_NODE_TYPES.TSTypeQuery:
                              return true;

                            case AST_NODE_TYPES.TSQualifiedName:
                              // TSTypeQuery must have a TSESTree.EntityName as its child, so we can filter here and break early
                              if (parent.left !== child) {
                                return false;
                              }
                              child = parent;
                              parent = parent.parent;
                              continue;
                            // END CASE 1

                            //////////////

                            // CASE 2:
                            // `type T = { [foo]: string }` will create a value reference because "foo" must be a value type
                            // however this value reference is safe to use with type-only imports.
                            // Also this is represented as a non-type AST - hence it uses MemberExpression
                            case AST_NODE_TYPES.TSPropertySignature:
                              return parent.key === child;

                            case AST_NODE_TYPES.MemberExpression:
                              if (parent.object !== child) {
                                return false;
                              }
                              child = parent;
                              parent = parent.parent;
                              continue;
                            // END CASE 2

                            default:
                              return false;
                          }
                        }
                      }

                      return ref.isTypeReference;
                    },
                  );
                  if (onlyHasTypeReferences) {
                    typeSpecifiers.push(specifier);
                  } else {
                    valueSpecifiers.push(specifier);
                  }
                }
              }

              if (
                (node.importKind === 'value' && typeSpecifiers.length) ||
                (node.importKind === 'type' && valueSpecifiers.length)
              ) {
                sourceImports.reportValueImports.push({
                  node,
                  typeSpecifiers,
                  valueSpecifiers,
                  unusedSpecifiers,
                  inlineTypeSpecifiers,
                });
              }
            },
            'Program:exit'(): void {
              for (const sourceImports of Object.values(sourceImportsMap)) {
                if (sourceImports.reportValueImports.length === 0) {
                  continue;
                }
                for (const report of sourceImports.reportValueImports) {
                  if (
                    report.valueSpecifiers.length === 0 &&
                    report.unusedSpecifiers.length === 0
                  ) {
                    // import is all type-only, convert the entire import to `import type`
                    context.report({
                      node: report.node,
                      messageId: 'typeOverValue',
                      *fix(fixer) {
                        yield* fixToTypeImportDeclaration(
                          fixer,
                          report,
                          sourceImports,
                        );
                      },
                    });
                  } else {
                    const isTypeImport = report.node.importKind === 'type';

                    // we have a mixed type/value import, so we need to split them out into multiple exports
                    const importNames = (
                      isTypeImport
                        ? report.valueSpecifiers
                        : report.typeSpecifiers
                    ).map(specifier => `"${specifier.local.name}"`);

                    const message = ((): {
                      messageId: MessageIds;
                      data: Record<string, unknown>;
                    } => {
                      const typeImports = util.formatWordList(importNames);

                      if (importNames.length === 1) {
                        if (isTypeImport) {
                          return {
                            messageId: 'aImportInDecoMeta',
                            data: { typeImports },
                          };
                        } else {
                          return {
                            messageId: 'aImportIsOnlyTypes',
                            data: { typeImports },
                          };
                        }
                      } else {
                        if (isTypeImport) {
                          return {
                            messageId: 'someImportsInDecoMeta',
                            data: { typeImports },
                          };
                        } else {
                          return {
                            messageId: 'someImportsAreOnlyTypes',
                            data: { typeImports },
                          };
                        }
                      }
                    })();

                    context.report({
                      node: report.node,
                      ...message,
                      *fix(fixer) {
                        if (isTypeImport) {
                          yield* fixToValueImportDeclaration(
                            fixer,
                            report,
                            sourceImports,
                          );
                        } else {
                          yield* fixToTypeImportDeclaration(
                            fixer,
                            report,
                            sourceImports,
                          );
                        }
                      },
                    });
                  }
                }
              }
            },
          }
        : {
            // prefer no type imports
            'ImportDeclaration[importKind = "type"]'(
              node: TSESTree.ImportDeclaration,
            ): void {
              context.report({
                node,
                messageId: 'valueOverType',
                fix(fixer) {
                  return fixRemoveTypeSpecifierFromImportDeclaration(
                    fixer,
                    node,
                  );
                },
              });
            },
            'ImportSpecifier[importKind = "type"]'(
              node: TSESTree.ImportSpecifier,
            ): void {
              context.report({
                node,
                messageId: 'valueOverType',
                fix(fixer) {
                  return fixRemoveTypeSpecifierFromImportSpecifier(fixer, node);
                },
              });
            },
          }),
      ...(disallowTypeAnnotations
        ? {
            // disallow `import()` type
            TSImportType(node: TSESTree.TSImportType): void {
              context.report({
                node,
                messageId: 'noImportTypeAnnotations',
              });
            },
          }
        : {}),
    };

    function classifySpecifier(node: TSESTree.ImportDeclaration): {
      defaultSpecifier: TSESTree.ImportDefaultSpecifier | null;
      namespaceSpecifier: TSESTree.ImportNamespaceSpecifier | null;
      namedSpecifiers: TSESTree.ImportSpecifier[];
    } {
      const defaultSpecifier =
        node.specifiers[0].type === AST_NODE_TYPES.ImportDefaultSpecifier
          ? node.specifiers[0]
          : null;
      const namespaceSpecifier =
        node.specifiers.find(
          (specifier): specifier is TSESTree.ImportNamespaceSpecifier =>
            specifier.type === AST_NODE_TYPES.ImportNamespaceSpecifier,
        ) ?? null;
      const namedSpecifiers = node.specifiers.filter(
        (specifier): specifier is TSESTree.ImportSpecifier =>
          specifier.type === AST_NODE_TYPES.ImportSpecifier,
      );
      return {
        defaultSpecifier,
        namespaceSpecifier,
        namedSpecifiers,
      };
    }

    /**
     * Returns information for fixing named specifiers.
     */
    function getFixesNamedSpecifiers(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.ImportDeclaration,
      typeNamedSpecifiers: TSESTree.ImportSpecifier[],
      allNamedSpecifiers: TSESTree.ImportSpecifier[],
    ): {
      typeNamedSpecifiersText: string;
      removeTypeNamedSpecifiers: TSESLint.RuleFix[];
    } {
      if (allNamedSpecifiers.length === 0) {
        return {
          typeNamedSpecifiersText: '',
          removeTypeNamedSpecifiers: [],
        };
      }
      const typeNamedSpecifiersTexts: string[] = [];
      const removeTypeNamedSpecifiers: TSESLint.RuleFix[] = [];
      if (typeNamedSpecifiers.length === allNamedSpecifiers.length) {
        // import Foo, {Type1, Type2} from 'foo'
        // import DefType, {Type1, Type2} from 'foo'
        const openingBraceToken = util.nullThrows(
          sourceCode.getTokenBefore(
            typeNamedSpecifiers[0],
            util.isOpeningBraceToken,
          ),
          util.NullThrowsReasons.MissingToken('{', node.type),
        );
        const commaToken = util.nullThrows(
          sourceCode.getTokenBefore(openingBraceToken, util.isCommaToken),
          util.NullThrowsReasons.MissingToken(',', node.type),
        );
        const closingBraceToken = util.nullThrows(
          sourceCode.getFirstTokenBetween(
            openingBraceToken,
            node.source,
            util.isClosingBraceToken,
          ),
          util.NullThrowsReasons.MissingToken('}', node.type),
        );

        // import DefType, {...} from 'foo'
        //               ^^^^^^^ remove
        removeTypeNamedSpecifiers.push(
          fixer.removeRange([commaToken.range[0], closingBraceToken.range[1]]),
        );

        typeNamedSpecifiersTexts.push(
          sourceCode.text.slice(
            openingBraceToken.range[1],
            closingBraceToken.range[0],
          ),
        );
      } else {
        const typeNamedSpecifierGroups: TSESTree.ImportSpecifier[][] = [];
        let group: TSESTree.ImportSpecifier[] = [];
        for (const namedSpecifier of allNamedSpecifiers) {
          if (typeNamedSpecifiers.includes(namedSpecifier)) {
            group.push(namedSpecifier);
          } else if (group.length) {
            typeNamedSpecifierGroups.push(group);
            group = [];
          }
        }
        if (group.length) {
          typeNamedSpecifierGroups.push(group);
        }
        for (const namedSpecifiers of typeNamedSpecifierGroups) {
          const { removeRange, textRange } = getNamedSpecifierRanges(
            namedSpecifiers,
            allNamedSpecifiers,
          );
          removeTypeNamedSpecifiers.push(fixer.removeRange(removeRange));

          typeNamedSpecifiersTexts.push(sourceCode.text.slice(...textRange));
        }
      }
      return {
        typeNamedSpecifiersText: typeNamedSpecifiersTexts.join(','),
        removeTypeNamedSpecifiers,
      };
    }

    /**
     * Returns ranges for fixing named specifier.
     */
    function getNamedSpecifierRanges(
      namedSpecifierGroup: TSESTree.ImportSpecifier[],
      allNamedSpecifiers: TSESTree.ImportSpecifier[],
    ): {
      textRange: TSESTree.Range;
      removeRange: TSESTree.Range;
    } {
      const first = namedSpecifierGroup[0];
      const last = namedSpecifierGroup[namedSpecifierGroup.length - 1];
      const removeRange: TSESTree.Range = [first.range[0], last.range[1]];
      const textRange: TSESTree.Range = [...removeRange];
      const before = sourceCode.getTokenBefore(first)!;
      textRange[0] = before.range[1];
      if (util.isCommaToken(before)) {
        removeRange[0] = before.range[0];
      } else {
        removeRange[0] = before.range[1];
      }

      const isFirst = allNamedSpecifiers[0] === first;
      const isLast = allNamedSpecifiers[allNamedSpecifiers.length - 1] === last;
      const after = sourceCode.getTokenAfter(last)!;
      textRange[1] = after.range[0];
      if (isFirst || isLast) {
        if (util.isCommaToken(after)) {
          removeRange[1] = after.range[1];
        }
      }

      return {
        textRange,
        removeRange,
      };
    }

    /**
     * insert specifiers to named import node.
     * e.g.
     * import type { Already, Type1, Type2 } from 'foo'
     *                        ^^^^^^^^^^^^^ insert
     */
    function fixInsertNamedSpecifiersInNamedSpecifierList(
      fixer: TSESLint.RuleFixer,
      target: TSESTree.ImportDeclaration,
      insertText: string,
    ): TSESLint.RuleFix {
      const closingBraceToken = util.nullThrows(
        sourceCode.getFirstTokenBetween(
          sourceCode.getFirstToken(target)!,
          target.source,
          util.isClosingBraceToken,
        ),
        util.NullThrowsReasons.MissingToken('}', target.type),
      );
      const before = sourceCode.getTokenBefore(closingBraceToken)!;
      if (!util.isCommaToken(before) && !util.isOpeningBraceToken(before)) {
        insertText = `,${insertText}`;
      }
      return fixer.insertTextBefore(closingBraceToken, `${insertText}`);
    }

    function* fixToTypeImportDeclaration(
      fixer: TSESLint.RuleFixer,
      report: ReportValueImport,
      sourceImports: SourceImports,
    ): IterableIterator<TSESLint.RuleFix> {
      const { node } = report;

      const { defaultSpecifier, namespaceSpecifier, namedSpecifiers } =
        classifySpecifier(node);

      if (namespaceSpecifier && !defaultSpecifier) {
        // import * as types from 'foo'
        yield* fixInsertTypeSpecifierForImportDeclaration(fixer, node, false);
        return;
      } else if (defaultSpecifier) {
        if (
          report.typeSpecifiers.includes(defaultSpecifier) &&
          namedSpecifiers.length === 0 &&
          !namespaceSpecifier
        ) {
          // import Type from 'foo'
          yield* fixInsertTypeSpecifierForImportDeclaration(fixer, node, true);
          return;
        }
      } else {
        if (
          namedSpecifiers.every(specifier =>
            report.typeSpecifiers.includes(specifier),
          ) &&
          !namespaceSpecifier
        ) {
          // import {Type1, Type2} from 'foo'
          yield* fixInsertTypeSpecifierForImportDeclaration(fixer, node, false);
          return;
        }
      }

      const typeNamedSpecifiers = namedSpecifiers.filter(specifier =>
        report.typeSpecifiers.includes(specifier),
      );

      const fixesNamedSpecifiers = getFixesNamedSpecifiers(
        fixer,
        node,
        typeNamedSpecifiers,
        namedSpecifiers,
      );
      const afterFixes: TSESLint.RuleFix[] = [];
      if (typeNamedSpecifiers.length) {
        if (sourceImports.typeOnlyNamedImport) {
          const insertTypeNamedSpecifiers =
            fixInsertNamedSpecifiersInNamedSpecifierList(
              fixer,
              sourceImports.typeOnlyNamedImport,
              fixesNamedSpecifiers.typeNamedSpecifiersText,
            );
          if (sourceImports.typeOnlyNamedImport.range[1] <= node.range[0]) {
            yield insertTypeNamedSpecifiers;
          } else {
            afterFixes.push(insertTypeNamedSpecifiers);
          }
        } else {
          yield fixer.insertTextBefore(
            node,
            `import type {${
              fixesNamedSpecifiers.typeNamedSpecifiersText
            }} from ${sourceCode.getText(node.source)};\n`,
          );
        }
      }

      const fixesRemoveTypeNamespaceSpecifier: TSESLint.RuleFix[] = [];
      if (
        namespaceSpecifier &&
        report.typeSpecifiers.includes(namespaceSpecifier)
      ) {
        // import Foo, * as Type from 'foo'
        // import DefType, * as Type from 'foo'
        // import DefType, * as Type from 'foo'
        const commaToken = util.nullThrows(
          sourceCode.getTokenBefore(namespaceSpecifier, util.isCommaToken),
          util.NullThrowsReasons.MissingToken(',', node.type),
        );

        // import Def, * as Ns from 'foo'
        //           ^^^^^^^^^ remove
        fixesRemoveTypeNamespaceSpecifier.push(
          fixer.removeRange([commaToken.range[0], namespaceSpecifier.range[1]]),
        );

        // import type * as Ns from 'foo'
        // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ insert
        yield fixer.insertTextBefore(
          node,
          `import type ${sourceCode.getText(
            namespaceSpecifier,
          )} from ${sourceCode.getText(node.source)};\n`,
        );
      }
      if (
        defaultSpecifier &&
        report.typeSpecifiers.includes(defaultSpecifier)
      ) {
        if (report.typeSpecifiers.length === node.specifiers.length) {
          const importToken = util.nullThrows(
            sourceCode.getFirstToken(node, isImportToken),
            util.NullThrowsReasons.MissingToken('import', node.type),
          );
          // import type Type from 'foo'
          //        ^^^^ insert
          yield fixer.insertTextAfter(importToken, ' type');
        } else {
          const commaToken = util.nullThrows(
            sourceCode.getTokenAfter(defaultSpecifier, util.isCommaToken),
            util.NullThrowsReasons.MissingToken(',', defaultSpecifier.type),
          );
          // import Type , {...} from 'foo'
          //        ^^^^^ pick
          const defaultText = sourceCode.text
            .slice(defaultSpecifier.range[0], commaToken.range[0])
            .trim();
          yield fixer.insertTextBefore(
            node,
            `import type ${defaultText} from ${sourceCode.getText(
              node.source,
            )};\n`,
          );
          const afterToken = util.nullThrows(
            sourceCode.getTokenAfter(commaToken, { includeComments: true }),
            util.NullThrowsReasons.MissingToken('any token', node.type),
          );
          // import Type , {...} from 'foo'
          //        ^^^^^^^ remove
          yield fixer.removeRange([
            defaultSpecifier.range[0],
            afterToken.range[0],
          ]);
        }
      }

      yield* fixesNamedSpecifiers.removeTypeNamedSpecifiers;
      yield* fixesRemoveTypeNamespaceSpecifier;

      yield* afterFixes;
    }

    function* fixInsertTypeSpecifierForImportDeclaration(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.ImportDeclaration,
      isDefaultImport: boolean,
    ): IterableIterator<TSESLint.RuleFix> {
      // import type Foo from 'foo'
      //       ^^^^^ insert
      const importToken = util.nullThrows(
        sourceCode.getFirstToken(node, isImportToken),
        util.NullThrowsReasons.MissingToken('import', node.type),
      );
      yield fixer.insertTextAfter(importToken, ' type');

      if (isDefaultImport) {
        // Has default import
        const openingBraceToken = sourceCode.getFirstTokenBetween(
          importToken,
          node.source,
          util.isOpeningBraceToken,
        );
        if (openingBraceToken) {
          // Only braces. e.g. import Foo, {} from 'foo'
          const commaToken = util.nullThrows(
            sourceCode.getTokenBefore(openingBraceToken, util.isCommaToken),
            util.NullThrowsReasons.MissingToken(',', node.type),
          );
          const closingBraceToken = util.nullThrows(
            sourceCode.getFirstTokenBetween(
              openingBraceToken,
              node.source,
              util.isClosingBraceToken,
            ),
            util.NullThrowsReasons.MissingToken('}', node.type),
          );

          // import type Foo, {} from 'foo'
          //                  ^^ remove
          yield fixer.removeRange([
            commaToken.range[0],
            closingBraceToken.range[1],
          ]);
          const specifiersText = sourceCode.text.slice(
            commaToken.range[1],
            closingBraceToken.range[1],
          );
          if (node.specifiers.length > 1) {
            // import type Foo from 'foo'
            // import type {...} from 'foo' // <- insert
            yield fixer.insertTextAfter(
              node,
              `\nimport type${specifiersText} from ${sourceCode.getText(
                node.source,
              )};`,
            );
          }
        }
      }

      // make sure we don't do anything like `import type {type T} from 'foo';`
      for (const specifier of node.specifiers) {
        if (
          specifier.type === AST_NODE_TYPES.ImportSpecifier &&
          specifier.importKind === 'type'
        ) {
          yield* fixRemoveTypeSpecifierFromImportSpecifier(fixer, specifier);
        }
      }
    }

    function* fixToValueImportDeclaration(
      fixer: TSESLint.RuleFixer,
      report: ReportValueImport,
      sourceImports: SourceImports,
    ): IterableIterator<TSESLint.RuleFix> {
      const { node } = report;

      const { defaultSpecifier, namespaceSpecifier, namedSpecifiers } =
        classifySpecifier(node);

      if (namespaceSpecifier) {
        // import type * as types from 'foo'
        yield* fixRemoveTypeSpecifierFromImportDeclaration(fixer, node);
        return;
      } else if (defaultSpecifier) {
        if (
          report.valueSpecifiers.includes(defaultSpecifier) &&
          namedSpecifiers.length === 0
        ) {
          // import type Type from 'foo'
          yield* fixRemoveTypeSpecifierFromImportDeclaration(fixer, node);
          return;
        }
      } else {
        if (
          namedSpecifiers.every(specifier =>
            report.valueSpecifiers.includes(specifier),
          )
        ) {
          // import type {Type1, Type2} from 'foo'
          yield* fixRemoveTypeSpecifierFromImportDeclaration(fixer, node);
          return;
        }
      }

      const valueNamedSpecifiers = namedSpecifiers.filter(specifier =>
        report.valueSpecifiers.includes(specifier),
      );

      const fixesNamedSpecifiers = getFixesNamedSpecifiers(
        fixer,
        node,
        valueNamedSpecifiers,
        namedSpecifiers,
      );
      const afterFixes: TSESLint.RuleFix[] = [];
      if (valueNamedSpecifiers.length) {
        if (sourceImports.valueOnlyNamedImport) {
          const insertTypeNamedSpecifiers =
            fixInsertNamedSpecifiersInNamedSpecifierList(
              fixer,
              sourceImports.valueOnlyNamedImport,
              fixesNamedSpecifiers.typeNamedSpecifiersText,
            );
          if (sourceImports.valueOnlyNamedImport.range[1] <= node.range[0]) {
            yield insertTypeNamedSpecifiers;
          } else {
            afterFixes.push(insertTypeNamedSpecifiers);
          }
        } else {
          yield fixer.insertTextBefore(
            node,
            `import {${
              fixesNamedSpecifiers.typeNamedSpecifiersText
            }} from ${sourceCode.getText(node.source)};\n`,
          );
        }
      }

      yield* fixesNamedSpecifiers.removeTypeNamedSpecifiers;

      yield* afterFixes;
    }

    function* fixRemoveTypeSpecifierFromImportDeclaration(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.ImportDeclaration,
    ): IterableIterator<TSESLint.RuleFix> {
      // import type Foo from 'foo'
      //        ^^^^ remove
      const importToken = util.nullThrows(
        sourceCode.getFirstToken(node, isImportToken),
        util.NullThrowsReasons.MissingToken('import', node.type),
      );
      const typeToken = util.nullThrows(
        sourceCode.getFirstTokenBetween(
          importToken,
          node.specifiers[0]?.local ?? node.source,
          isTypeToken,
        ),
        util.NullThrowsReasons.MissingToken('type', node.type),
      );
      const afterToken = util.nullThrows(
        sourceCode.getTokenAfter(typeToken, { includeComments: true }),
        util.NullThrowsReasons.MissingToken('any token', node.type),
      );
      yield fixer.removeRange([typeToken.range[0], afterToken.range[0]]);
    }

    function* fixRemoveTypeSpecifierFromImportSpecifier(
      fixer: TSESLint.RuleFixer,
      node: TSESTree.ImportSpecifier,
    ): IterableIterator<TSESLint.RuleFix> {
      const typeToken = util.nullThrows(
        sourceCode.getFirstToken(node, isTypeToken),
        util.NullThrowsReasons.MissingToken('type', node.type),
      );
      const afterToken = util.nullThrows(
        sourceCode.getTokenAfter(typeToken, { includeComments: true }),
        util.NullThrowsReasons.MissingToken('any token', node.type),
      );
      yield fixer.removeRange([typeToken.range[0], afterToken.range[0]]);
    }
  },
});
