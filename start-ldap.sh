#!/bin/bash

echo "🚀 Starting LDAP server for SCIM Gateway..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start the container
docker-compose -f docker-compose-ldap.yml up -d

echo "⏳ Waiting for LDAP server to be ready..."
sleep 10

# Test LDAP connection
echo "🔍 Testing LDAP connection..."
if docker exec ldapserver ldapsearch -x -H ldap://localhost -b "dc=iam,dc=asml,dc=com" -D "cn=admin,dc=iam,dc=asml,dc=com" -w adminpassword "(objectClass=*)" dn > /dev/null 2>&1; then
    echo "✅ LDAP server is running successfully!"
    echo ""
    echo "📋 Connection details:"
    echo "  LDAP URL: ldap://localhost:1389"
    echo "  Admin DN: cn=admin,dc=iam,dc=asml,dc=com"
    echo "  Admin Password: adminpassword"
    echo "  Base DN: dc=iam,dc=asml,dc=com"
    echo "  User Base: ou=users,dc=iam,dc=asml,dc=com"
    echo "  Group Base: dc=iam,dc=asml,dc=com"
    echo ""
    echo "🔧 To stop the server: docker-compose -f docker-compose-ldap.yml down"
else
    echo "❌ LDAP server failed to start properly. Check logs with:"
    echo "   docker-compose -f docker-compose-ldap.yml logs"
fi