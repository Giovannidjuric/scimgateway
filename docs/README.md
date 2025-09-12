# SCIM Gateway Documentation

This folder contains comprehensive documentation for extending and understanding the SCIM Gateway implementation.

## Documents

### 📖 [PERMISSIONS_ROUTE.md](./PERMISSIONS_ROUTE.md)
Complete documentation of how the `/permissions` route works, including:
- Architecture and implementation details
- Configuration examples
- API usage documentation
- Security features
- Troubleshooting guide

### 🛠️ [HOW_TO_ADD_NEW_ROUTES.md](./HOW_TO_ADD_NEW_ROUTES.md)
Step-by-step guide for adding new SCIM routes, using `/roles` as an example:
- Complete implementation checklist
- Code templates and examples
- Configuration patterns
- Testing procedures
- Best practices and troubleshooting

## Quick Start

### Adding a New Route

1. **Follow the guide**: Start with [HOW_TO_ADD_NEW_ROUTES.md](./HOW_TO_ADD_NEW_ROUTES.md)
2. **Use the checklist**: Ensure you complete all required steps
3. **Test thoroughly**: Use the provided curl examples
4. **Document**: Create route-specific documentation if needed

### Understanding Existing Routes

1. **Review architecture**: Check [PERMISSIONS_ROUTE.md](./PERMISSIONS_ROUTE.md) for patterns
2. **Study implementation**: Look at file references and line numbers
3. **Test functionality**: Use the provided API examples

## File Structure

```
docs/
├── README.md                     # This file
├── PERMISSIONS_ROUTE.md          # Permissions route documentation  
└── HOW_TO_ADD_NEW_ROUTES.md     # New route implementation guide
```

## Key Implementation Files

- `lib/scimgateway.ts` - Route handler configuration
- `lib/plugin-ldap.ts` - LDAP function implementations
- `config/plugin-ldap.json` - Configuration and mapping

## Support

For questions about:
- **Permissions route**: See [PERMISSIONS_ROUTE.md](./PERMISSIONS_ROUTE.md)
- **Adding new routes**: See [HOW_TO_ADD_NEW_ROUTES.md](./HOW_TO_ADD_NEW_ROUTES.md)
- **Troubleshooting**: Check the troubleshooting sections in both documents

---

**Last Updated**: 2025-09-12