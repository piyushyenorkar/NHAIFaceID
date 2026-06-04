import React, { useState, useEffect, useLayoutEffect } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, Image, Alert, SafeAreaView } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { getAllEnrolledFaces, getVerificationsToday, getPendingSyncLogs, purgeAllData } from '../services/localStorage';

export default function UserListScreen({ navigation }) {
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const [activeTab, setActiveTab] = useState('enrolled');
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({ enrolled: 0, verified: 0, pending: 0 });

  useEffect(() => {
    loadAllData();
  }, [activeTab]);

  const loadAllData = async () => {
    try {
      // Fetch all to update summary counters
      const enrolledRes = await getAllEnrolledFaces();
      const verifiedRes = await getVerificationsToday();
      const pendingRes = await getPendingSyncLogs();
      
      setStats({
        enrolled: enrolledRes.length,
        verified: verifiedRes.length,
        pending: pendingRes.length
      });

      // Map to get names and thumbnails for verified and pending logs
      const enrolledMap = {};
      enrolledRes.forEach(face => {
        enrolledMap[face.employee_id] = face;
      });

      const mapWithEnrolledData = (log) => ({
        ...log,
        name: enrolledMap[log.employee_id]?.name || 'UNKNOWN',
        thumbnail_path: enrolledMap[log.employee_id]?.thumbnail_path || null
      });

      if (activeTab === 'enrolled') setData(enrolledRes);
      else if (activeTab === 'verified') setData(verifiedRes.map(mapWithEnrolledData));
      else if (activeTab === 'pending') setData(pendingRes.map(mapWithEnrolledData));
    } catch (e) {
      console.error('Failed to load tab data', e);
    }
  };

  const handleWipe = () => {
    Alert.alert(
      "Wipe Entire Database?",
      "This will instantly delete all users and all logs so you can start completely fresh. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Wipe Now", 
          style: "destructive",
          onPress: async () => {
            await purgeAllData();
            loadAllData();
            Alert.alert("Success", "All test data wiped!");
          }
        }
      ]
    );
  };

  const getTheme = () => {
    if (activeTab === 'enrolled') return { color: '#F59E0B', bg: '#FEF3C7', border: '#FCD34D' }; // Yellow
    if (activeTab === 'verified') return { color: '#10B981', bg: '#D1FAE5', border: '#6EE7B7' }; // Green
    if (activeTab === 'pending') return { color: '#F97316', bg: '#FFEDD5', border: '#FDBA74' }; // Orange
    return { color: '#6B7280', bg: '#F3F4F6', border: '#E5E7EB' };
  };

  const theme = getTheme();

  const renderCard = ({ item }) => {
    const name = item.name || (item.employee ? item.employee.name : 'UNKNOWN');
    const id = item.employee_id || '0000';
    
    // Parse embedding
    let embeddingArray = [];
    if (item.embedding) {
      try {
        embeddingArray = JSON.parse(item.embedding);
        if (Array.isArray(embeddingArray) && Array.isArray(embeddingArray[0])) {
          embeddingArray = embeddingArray[0];
        }
      } catch (e) {}
    }

    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    return (
      <View style={[styles.listCard, { borderColor: theme.border }]}>
        <View style={styles.cardHeader}>
          {item.thumbnail_path ? (
            <Image 
              source={{ uri: item.thumbnail_path }} 
              style={[styles.avatarImg, { borderColor: theme.color }]} 
            />
          ) : (
            <View style={[styles.avatarImg, styles.avatarPlaceholder, { borderColor: theme.color, backgroundColor: theme.color }]}>
               <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
            <Text style={styles.cardId}>ID: {id}</Text>
            {activeTab !== 'enrolled' && (
              <Text style={[styles.cardId, { color: theme.color, fontWeight: 'bold', marginTop: 2 }]}>
                {item.confidence ? 'Match Confidence: ' + parseFloat(item.confidence).toFixed(1) + '%' : 'N/A'}
              </Text>
            )}
          </View>
        </View>

        {activeTab === 'enrolled' && (
          <View style={styles.hashContainer}>
            <Text style={styles.hashTitle}>192-D MobileFaceNet Embedding (First 8):</Text>
            <Text style={styles.hashText}>
              [{embeddingArray.slice(0, 8).map(v => (typeof v === 'number' ? v : Number(v) || 0).toFixed(4)).join(', ')}...]
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation?.goBack()}>
              <Svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#F5C40A" fill="none">
                <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <Path d="M5 12l14 0" />
                <Path d="M5 12l6 6" />
                <Path d="M5 12l6 -6" />
              </Svg>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Biometric Registry</Text>
          </View>
          
          <TouchableOpacity style={styles.wipeBtn} onPress={handleWipe}>
            <Svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" stroke="#EF4444" fill="none" style={{marginRight: 6}}>
              <Path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <Path d="M4 7l16 0" />
              <Path d="M10 11l0 6" />
              <Path d="M14 11l0 6" />
              <Path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
              <Path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
            </Svg>
            <Text style={styles.wipeText}>Wipe all Test data</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryContainer}>
          <TouchableOpacity 
            style={[styles.summaryBox, activeTab === 'enrolled' ? { borderColor: '#F59E0B', backgroundColor: '#FEF3C7' } : null]} 
            onPress={() => setActiveTab('enrolled')}
          >
            <Text style={[styles.summaryLabel, { color: '#F59E0B' }]}>ENROLLED</Text>
            <Text style={[styles.summaryCount, { color: '#F59E0B' }]}>{stats.enrolled}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.summaryBox, activeTab === 'verified' ? { borderColor: '#10B981', backgroundColor: '#D1FAE5' } : null]} 
            onPress={() => setActiveTab('verified')}
          >
            <Text style={[styles.summaryLabel, { color: '#10B981' }]}>VERIFIED</Text>
            <Text style={[styles.summaryCount, { color: '#10B981' }]}>{stats.verified}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.summaryBox, activeTab === 'pending' ? { borderColor: '#F97316', backgroundColor: '#FFEDD5' } : null]} 
            onPress={() => setActiveTab('pending')}
          >
            <Text style={[styles.summaryLabel, { color: '#F97316' }]}>PENDING</Text>
            <Text style={[styles.summaryCount, { color: '#F97316' }]}>{stats.pending}</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          key="list-1col"
          data={data}
          keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
          renderItem={renderCard}
          numColumns={1}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={<Text style={styles.emptyText}>No records found.</Text>}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A1F44',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    backgroundColor: '#0A1F44',
    paddingTop: 14,
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 8,
    padding: 6,
    marginRight: 12,
  },
  headerTitle: {
    color: '#F5C40A',
    fontSize: 20,
    fontWeight: 'bold',
  },
  wipeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  wipeText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#FFF',
  },
  summaryBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 12,
    marginHorizontal: 4,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryCount: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 12,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#64748B',
    fontSize: 14,
  },
  listCard: {
    marginBottom: 12,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    marginRight: 15,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  cardInfo: {
    flex: 1,
  },
  cardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  cardId: {
    fontSize: 14,
    color: '#64748B',
  },
  hashContainer: {
    backgroundColor: '#000',
    padding: 10,
    borderRadius: 6,
    marginTop: 12,
  },
  hashTitle: {
    color: '#00FF00',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  hashText: {
    color: '#00FF00',
    fontSize: 10,
    fontFamily: 'monospace',
  }
});
